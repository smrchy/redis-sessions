
import _ from "lodash";

import { createClient } from "redis";
import type { RedisClientOptions } from "redis";

import { EventEmitter } from "node:events";

import { LRUCache } from "lru-cache";
export interface ConstructorOptions {
	port?: number;
	host?: string;
	options?: RedisClientOptions; // maybe something else
	namespace?: string;
	wipe?: number;
	cachetime?: number;
}

interface EvaluatedOption {
	app: string;
	token?: string;
	id?: string;
	ip?: string;
	ttl?: number;
	no_resave?: boolean;
	d?: Record<string, string|number|boolean|null>;
	dt?: number;
	noupdate?: boolean;
	nochache?: boolean;
}

export interface Session {
	id: string;
	r: number;
	w: number;
	ttl: number;
	idle: number;
	ip: string;
	d?: Record<string, string|boolean|number|null>;
	no_resave?: boolean;
}



/** RedisSessions

 To create a new instance use:

 	RedisSessions = require("redis-sessions")
	rs = new RedisSessions()

	Parameters:

	`port`: *optional* Default: `6379`. The Redis port.
	`host`, *optional* Default: `127.0.0.1`. The Redis host.
	`options`, *optional* Default: `{}`. Additional options. See [https://github.com/mranney/node_redis#rediscreateclientport-host-options](redis.createClient))
	`namespace`: *optional* Default: `rs`. The namespace prefix for all Redis keys used by this module.
	`wipe`: *optional* Default: `600`. The interval in second after which the timed out sessions are wiped. No value less than 10 allowed.
	`cachetime` (Number) *optional* Number of seconds to cache sessions in memory. Can only be used if no `client` is supplied. See the "Cache" section. Default: `0`.
*/
class RedisSessions {
	private redisns: string;
	private isCache = false;
	private redis: ReturnType<typeof createClient>;
	private redissub: ReturnType<typeof createClient>|null = null;
	private connected: boolean;
	private toConnect: Promise<boolean>;
	private sessionCache: LRUCache<string, Session>|null = null;
	private wiperInterval: ReturnType<typeof setInterval>|null = null;
	private subscribed: boolean = false;
	private toSubscribe: Promise<boolean> = Promise.resolve(true);
	constructor(o?: ConstructorOptions) {
		o = o || {};
		this.redisns = o.namespace ?? "rs";
		this.redisns += ":";

		if (o.options && o.options.url) {
			this.redis = createClient(o.options);
		} else {
			this.redis = createClient(_.merge(o.options ?? {}, { socket: { port: o.port ?? 6379, host: o.host ?? "127.0.0.1" } }));
		}

		this.connected = false;

		// to handle async connect of client
		this.toConnect = this.connect();


		if (o.cachetime && o.cachetime > 0) {
			// Setup node-cache
			this.sessionCache = new LRUCache<string, Session>({
				ttl: o.cachetime * 1000,
				updateAgeOnGet: false,
				ttlAutopurge: false
			});
			// Setup the Redis subscriber to listen for changes
			if (o.options && o.options.url) { this.redissub = createClient(o.options); } else {
				this.redissub = createClient(_.merge(o.options ?? {}, { socket: { port: o.port ?? 6379, host: o.host ?? "127.0.0.1" } }));
			}
			// Setup the subscriber
			this.isCache = true;
			// Setup the subscriber
			this.toSubscribe = this.subscribe();

		}


		if (o.wipe !== 0) {
			let wipe = o.wipe || 600;
			if (wipe < 10) {
				wipe = 10;
			}
			this.wiperInterval = setInterval(this._wipe, wipe * 1000);
		}
	}

	/* Activity

	Get the number of active unique users (not sessions!) within the last *n* seconds

	**Parameters:**

	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	* `dt` Delta time. Amount of seconds to check (e.g. 600 for the last 10 min.)
	*/
	public async activity(options: {app: string; dt: number}) {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		this._validate(options, ["app", "dt"]);
		const count = await this.redis.zCount(`${this.redisns}${options.app}:_users`, this._now() - options.dt, "+inf");
		return { activity: count };
	}

	/* Create

	Creates a session for an app and id.

	**Parameters:**

	An object with the following keys:

	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	* `id` must be [a-zA-Z0-9_-] and 1-64 chars long
	* `ip` must be a valid IP4 address
	* `ttl` *optional* Default: 7200. Positive integer between 1 and 2592000 (30 days)

	* `d` *optional* Default: undefined. Object containing additional information. Only string, number, boolean or null values
	* `no_resave` *optional* Default: false. Boolean if true ttl will not refresh

	**Example:**

		create({
			app: "forum",
			id: "user1234",
			ip: "156.78.90.12",
			ttl: 3600
		}, callback)

	Returns the token when successful.
	*/

	public async create(options: {app: string; id: string; ip: string; ttl?: number; d?: Record<string, string|number|boolean|null>; no_resave?: boolean}) {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		options.d = options.d || { ___duMmYkEy: null };
		this._validate(options, [
			"app",
			"id",
			"ip",
			"ttl",
			"d",
			"no_resave"
		]);
		const token = this._createToken();
		// Prepopulate the multi statement
		const mc = this._createMultiStatement(options.app, token, options.id, options.ttl ?? 7200, false);
		mc.sAdd(`${this.redisns}${options.app}:us:${options.id}`, token);
		// Create the default session hash
		const thesession: Record<string, string|number> = {
			id: options.id,
			r: 1,
			w: 1,
			ip: options.ip,
			la: this._now(),
			ttl: options.ttl ?? 7200
		};
		if (options.d) {
			// Remove null values
			const nullkeys = [];
			for (const e of Object.keys(options.d)) {
				if (options.d[e] === null) {
					nullkeys.push(e);
				}
				options.d = _.omit(options.d, nullkeys);
			}
			if (_.keys(options.d).length > 0) {
				thesession.d = JSON.stringify(options.d);
			}
		}
		// Check for `no_resave` #36
		if (options.no_resave) {
			thesession.no_resave = 1;
		}
		mc.hSet(`${this.redisns}${options.app}:${token}`, thesession);
		// Run the redis statement
		const resp = await mc.exec();
		// curently returns number of insertet key value pairs
		// old:resp[4] !== "OK"
		if (typeof resp[4] !== "number" || resp[4] < 4) {
			throw new Error("Unknown Error");
		}
		return { token: token };
	}

	/* Get

	Get a session for an app and token.

	**Parameters:**

	An object with the following keys:

	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	* `token` must be [a-zA-Z0-9] and 64 chars long

	* _noupdate & nocache used by kill/set functions to skip certain parts in this function
	* if _noupdate is set session wont be cached
	*/
	public async get(options: {app: string; token: string; _noupdate?: boolean; _nocache?: boolean}) {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		this._validate(options, ["app", "token"]);
		const cachekey = `${options.app}:${options.token}`;
		if (this.isCache && !options._nocache && this.sessionCache) {
			// Try to find the session in cache
			const cache = this.sessionCache.get(cachekey);
			if (cache) {
				return cache;
			}
		}
		const thekey = `${this.redisns}${cachekey}`;

		const resp = await this.redis.hmGet(thekey, [
			"id",
			"r",
			"w",
			"ttl",
			"d",
			"la",
			"ip",
			"no_resave"
		]);
		const o = this._prepareSession(resp);
		if (o === null) {
			return null;
		}
		// Secret switch to disable updating the stats - we don't need this when we kill a session
		if (options._noupdate) {
			return o;
		}
		if (this.isCache && this.sessionCache) {
			this.sessionCache.set(cachekey, o);
		}
		// Update the counters
		const mc = this._createMultiStatement(options.app, options.token, o.id, o.ttl, o.no_resave);
		mc.hIncrBy(thekey, "r", 1);
		if (o.idle > 1) {
			mc.hSet(thekey, "la", this._now());
		}

		await mc.exec();
		return o;
	}

	/* Kill

	Kill a session for an app and token.

	**Parameters:**

	An object with the following keys:

	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	* `token` must be [a-zA-Z0-9] and 64 chars long
	*/
	public async kill(options: {app: string; token: string}) {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		this._validate(options, ["app", "token"]);
		const getOptions = {
			app: options.app,
			token: options.token,
			_nouupdate: true
		};
		const resp = await this.get(getOptions);
		if (!resp) {
			return { kill: 0 };
		}
		const killOptions = {
			id: resp.id,
			app: options.app,
			token: options.token
		};
		return await this._kill(killOptions);
	}

	/* Helper to _kill a single session

	Used by @kill and @wipe

	Needs options.app, options.token and options.id
	*/
	private async _kill(options: {app: string; token: string; id: string}) {
		const mc = this.redis.multi();
		mc.zRem(`${this.redisns}${options.app}:_sessions`, `${options.token}:${options.id}`);
		mc.sRem(`${this.redisns}${options.app}:us:${options.id}`, `${options.token}`);
		mc.zRem(`${this.redisns}SESSIONS`, `${options.app}:${options.token}:${options.id}`);
		mc.del(`${this.redisns}${options.app}:${options.token}`);
		mc.exists(`${this.redisns}${options.app}:us:${options.id}`);
		if (this.isCache) {
			if (!this.subscribed) {
				this.subscribed = await this.toSubscribe;
			}
			mc.publish(`${this.redisns}cache`, `${options.app}:${options.token}`);
		}
		const resp = await mc.exec();
		if (resp[4] === 0) {
			await this.redis.zRem(`${this.redisns}${options.app}:_users`, `${options.id}`);
		}
		return { kill: resp[3] };
	}

	/* Killall

	Kill all sessions of a single app

	Parameters:

	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	*/
	public async killall(options: {app: string}) {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		this._validate(options, ["app"]);
		// First we need to get all sessions of the app
		const appsessionkey = `${this.redisns}${options.app}:_sessions`;
		const appuserkey = `${this.redisns}${options.app}:_users`;
		const resp = await this.redis.zRange(appsessionkey, 0, -1);
		if (resp.length === 0) {
			return { kill: 0 };
		}
		const globalkeys = [];
		const tokenkeys = [];
		let userkeys = [];
		for (const e of resp) {
			const thekey = e.split(":");
			globalkeys.push(`${options.app}:${e}`);
			tokenkeys.push(`${this.redisns}${options.app}:${thekey[0]}`);
			userkeys.push(thekey[1]);
		}
		userkeys = _.uniq(userkeys);
		const ussets: string[] = [];
		for (const e of userkeys) {
			ussets.push(`${this.redisns}${options.app}:us:${e}`);
		}
		const mc = this.redis.multi();
		mc.zRem(appsessionkey, resp);
		mc.zRem(appuserkey, userkeys);
		mc.zRem(`${this.redisns}SESSIONS`, globalkeys);
		mc.del(ussets);
		mc.del(tokenkeys);

		if (this.isCache) {
			if (!this.subscribed) {
				this.subscribed = await this.toSubscribe;
			}
			for (const e of resp) {
				mc.publish(`${this.redisns}cache`, `${options.app}:${e.split(":")[0]}`);
			}
		}
		const response = await mc.exec();
		return { kill: response[0] };
	}

	/* Kill all Sessions of Id

	Kill all sessions of a single id within an app

	Parameters:

	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	* `id` must be [a-zA-Z0-9_-] and 1-64 chars long
	*/
	public async killsoid(options: {app: string;id: string}) {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		this._validate(options, ["app", "id"]);
		const resp = await this.redis.sMembers(`${this.redisns}${options.app}:us:${options.id}`);
		if (resp.length === 0) {
			return { kill: 0 };
		}
		const mc = this.redis.multi();
		if (this.isCache && !this.subscribed) {
			this.subscribed = await this.toSubscribe;
		}
		// Grab all sessions we need to get
		for (const token of resp) {
			// Add the multi commands
			mc.zRem(`${this.redisns}${options.app}:_sessions`, `${token}:${options.id}`);
			mc.sRem(`${this.redisns}${options.app}:us:${options.id}`, token);
			mc.zRem(`${this.redisns}SESSIONS`, `${options.app}:${token}:${options.id}`);
			mc.del(`${this.redisns}${options.app}:${token}`);
			if (this.isCache) {
				mc.publish(`${this.redisns}cache`, `${options.app}:${token}`);
			}
		}
		mc.exists(`${this.redisns}${options.app}:us:${options.id}`);

		const response = await mc.exec();
		// get the amount of deleted sessions

		let total = 0;
		const ref = response.slice(3);
		for (let k = 0; k < ref.length; k += 4) {
			const e = ref[k];
			if (typeof e === "number") {
				total += e;
			} else {
				// Don`t know if my fault but probably should be an Error
				throw new TypeError("Critical Error in killsoid");
			}
		}

		// NOW. If the last reply of the multi statement is 0 then this was the last session.
		// We need to remove the ZSET for this user also:
		if (response.at(-1) === 0) {
			await this.redis.zRem(`${this.redisns}${options.app}:_users`, options.id);
		}
		return { kill: total };
	}

	// Ping
	//
	// Ping  the Redis server
	public async ping() {
		if (!this.connected) {

			this.connected = await this.toConnect;
		}
		return await this.redis.ping();
	}

	// Quit
	//
	// Quit the Redis connection
	// This is needed if Redis-Session is used with AWS Lambda.
	public async quit() {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		if (this.wiperInterval !== null) {
			clearInterval(this.wiperInterval);
		}
		await this.redis.quit();
	}

	/* Set

	 Set/Update/Delete custom data for a single session.
	 All custom data is stored in the `d` object which is a simple hash object structure.

	 `d` might contain **one or more** keys with the following types: `string`, `number`, `boolean`, `null`.
	 Keys with all values except `null` will be stored. If a key containts `null` the key will be removed.

	 Note: If `d` already contains keys that are not supplied in the set request then these keys will be untouched.

	 **Parameters:**

	 An object with the following keys:

	 * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	 * `token` must be [a-zA-Z0-9] and 64 chars long
	 * `d` must be an object with keys whose values only consist of strings, numbers, boolean and null.
	 * `no_resave` *optional* Default: false. Boolean if true ttl will not refresh
	*/
	public async set(options: {
		app: string;
		token: string;
		d: Record<string, string|number|boolean|null>;
		no_resave?: boolean;
	}) {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		this._validate(options, [
			"app",
			"token",
			"d",
			"no_resave"
		]);

		const getOptions = {
			app: options.app,
			d: options.d,
			token: options.token,
			_noupdate: true,
			_nocache: true
		};
		// Get the session
		let resp = await this.get(getOptions);
		if (!resp) {
			return null;
		}
		// Cleanup `d`
		const nullkeys: string[] = [];
		for (const e of Object.keys(options.d)) {
			if (options.d[e] === null) {
				nullkeys.push(e);
			}
		}
		// OK ready to set some data
		if (resp.d) {
			resp.d = _.extend(_.omit(resp.d, nullkeys), _.omit(options.d, nullkeys));
		} else {
			resp.d = _.omit(options.d, nullkeys);
		}
		// We now have a cleaned version of resp.d ready to save back to Redis.
		// If resp.d contains no keys we want to delete the `d` key within the hash though.
		const thekey = `${this.redisns}${options.app}:${options.token}`;
		const mc = this._createMultiStatement(options.app, options.token, resp.id, resp.ttl, resp.no_resave);
		mc.hIncrBy(thekey, "w", 1);
		// Only update the `la` (last access) value if more than 1 second idle
		if (resp.idle > 1) {
			mc.hSet(thekey, "la", this._now());
		}
		if (_.keys(resp.d).length > 0) {
			mc.hSet(thekey, "d", JSON.stringify(resp.d));
		} else {
			mc.hDel(thekey, "d");
			resp = _.omit(resp, "d");
		}

		if (this.isCache) {
			if (!this.subscribed) {
				this.subscribed = await this.toSubscribe;
			}
			mc.publish(`${this.redisns}cache`, `${options.app}:${options.token}`);
		}
		const reply = await mc.exec();
		if (typeof reply[3] === "number") {
			resp.w = reply[3];
		} else {
			throw new TypeError("Critical Error Set Option");
		}
		return resp;
	}

	/* Session of App

	 Returns all sessions of a single app that were active within the last *n* seconds
	 Note: This might return a lot of data depending on `dt`. Use with care.

	 **Parameters:**

	 * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	 * `dt` Delta time. Amount of seconds to check (e.g. 600 for the last 10 min.)
	*/

	public async soapp(options: {app: string; dt: number}) {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		this._validate(options, ["app", "dt"]);

		// https://redis.io/commands/zrevrangebyscore/
		const resp = await this.redis.zRange(`${this.redisns}${options.app}:_sessions`, "+inf", this._now() - options.dt, {
			BY: "SCORE",
			REV: true
		});

		const result: string[] = [];
		for (const e of resp) {
			result.push(e.split(":")[0]);
		}

		return this._returnSessions(options, result);
	}

	/* Sessions of ID (soid)

	 Returns all sessions of a single id

	 **Parameters:**

	 An object with the following keys:

	 * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	 * `id` must be [a-zA-Z0-9_-] and 1-64 chars long
	*/

	public async soid(options: {app: string; id: string}) {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}
		this._validate(options, ["app", "id"]);

		const resp = await this.redis.sMembers(`${this.redisns}${options.app}:us:${options.id}`);
		return await this._returnSessions(options, resp);
	}

	// Helpers

	// to handle async work of constructor
	private async connect() {
		await this.redis.connect();
		return true;
	}

	private _createMultiStatement = (app: string, token: string, id: string, ttl: number, no_resave?: boolean) => {
		const now = this._now();
		const multi = this.redis.multi();
		multi.zAdd(`${this.redisns}${app}:_sessions`, { score: now, value: `${token}:${id}` });
		multi.zAdd(`${this.redisns}${app}:_users`, { score: now, value: id });
		multi.zAdd(`${this.redisns}SESSIONS`, { score: now + ttl, value: `${app}:${token}:${id}` });
		if (no_resave) {
			multi.hSet(`${this.redisns}${app}:${token}`, "ttl", ttl);
		}
		return multi;
	};

	private _createToken = () => {
		let t = "";
		// Note we don't use Z as a valid character here
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYabcdefghijklmnopqrstuvwxyz0123456789";
		for (let i = 0; i < 55; i++) {
			t += possible.charAt(Math.floor(Math.random() * possible.length));
		}

		// add the current time in ms to the very end seperated by a Z
		return t + "Z" + Date.now().toString(36);
	};

	// returns new Error
	private _handleError(err: "missingParameter"|"invalidFormat"|"invalidValue", data: {item: string}|{msg: string}) {
		// try to create a error Object with humanized message
		if (_.isString(err)) {
			const _err = new Error(err);
			_err.name = err;
			if ("msg" in data) {
				_err.message = data.msg;
			} else {
				if (err === "missingParameter") {
					_err.message = `No ${data.item} supplied`;
				} else {
					_err.message = `Invalid ${data.item} format`;
				}
			}
			return _err;
		}
		return new Error(err);
	}

	// returns current timestamp in seconds
	private _now() {
		return Number.parseInt("" + (Date.now() / 1000), 10);
	}

	// takes redis response and builds the corresponding session object
	private _prepareSession(session: (string|null)[]) {
		const now = this._now();
		if (session[0] === null) {
			return null;
		}
		// Create the return object
		const o: Session = {
			id: session[0].toString(),
			r: Number(session[1]),
			w: Number(session[2]),
			ttl: Number(session[3]),
			idle: now - Number(session[5]),
			ip: `${session[6]}`,
		};
		// Oh wait. If o.ttl < o.idle we need to bail out.
		if (o.ttl < o.idle) {
			// We return an empty session object
			return null;
		}
		// Support for `no_resave` #36
		if (session[7] === "1") {
			o.no_resave = true;
			o.ttl = o.ttl - o.idle;
		}
		// Parse the content of `d`
		if (session[4]) {
			o.d = JSON.parse(session[4]);
		}
		return o;
	}

	private async _returnSessions(options: {app: string}, sessions: string[]) {
		if (sessions.length === 0) {
			return { sessions: [] };
		}
		const mc = this.redis.multi();
		for (const e of sessions) {
			mc.hmGet(`${this.redisns}${options.app}:${e}`, [
				"id",
				"r",
				"w",
				"ttl",
				"d",
				"la",
				"ip",
				"no_resave"
			]);
		}
		const resp = await mc.exec();
		const o = [];
		for (const e of resp) {
			if (Array.isArray(e)) {
				const result: (string|null)[] = [];
				for (const reply of e) {
					if (typeof reply === "string" || typeof reply === "number") {
						result.push(reply.toString());
					} else if (reply === null) {
						result.push(reply);
					} else {
						throw new Error("Critical Error in return Session");
					}
				}
				const session = this._prepareSession(result);
				if (session) {
					o.push(session);
				}
			} else {
				throw new TypeError("Critical Error in return Session2");
			}
		}
		return { sessions: o };
	}

	// handle redissub from constructor because of async
	private async subscribe() {
		if (this.redissub) {
			await this.redissub.connect();
			await this.redissub.subscribe(`${this.redisns}cache`, (message, _channel) => {
				if (this.sessionCache) {
					this.sessionCache.delete(message);
				}
				return;
			});
		}
		return true;
	}

	// Validation regex used by _validate
	private VALID = {
		app: /^([\w-]){3,20}$/,
		id:	/^(.*?){1,128}$/,
		ip:	/^.{1,39}$/,
		token: /^([\dA-Za-z]){64}$/
	};

	// trows an Error if user input isn`t following rules
	private _validate<T extends EvaluatedOption>(o: T, items: string[]) {
		for (const item of items) {
			switch (item) {
				case "app":
				case "id":
				case "ip":
				case "token": {
					const value = o[item];
					if (!value) {
						throw this._handleError("missingParameter", { item: item });
					}
					if (!this.VALID[item].test(value)) {
						throw this._handleError("invalidFormat", { item: item });
					}
					break;
				}
				case "ttl": {
					const ttl = Number.parseInt(o.ttl ? `${o.ttl}` : "7200", 10);
					if (_.isNaN(ttl) || !_.isNumber(ttl) || ttl < 10) {
						throw this._handleError("invalidValue", { msg: "ttl must be a positive integer >= 10" });
					}
					break;
				}
				case "no_resave": {
					break;
				}
				case "dt": {
					const dt = Number.parseInt(`${o[item]}`, 10);
					if (_.isNaN(dt) || !_.isNumber(dt) || dt < 10) {
						throw this._handleError("invalidValue", { msg: "ttl must be a positive integer >= 10" });
					}
					break;
				}
				case "d": {
					if (!o[item]) {
						throw this._handleError("missingParameter", { item: item });
					}
					if (!_.isObject(o.d) || _.isArray(o.d)) {
						throw this._handleError("invalidValue", { msg: "d must be an object" });
					}
					const keys = _.keys(o.d);
					if (keys.length === 0) {
						throw this._handleError("invalidValue", { msg: "d must containt at least one key." });
					}
					// Check if every key is either a boolean, string or a number
					for (const e of Object.keys(o.d)) {
						if (!_.isString(o.d[e]) && !_.isNumber(o.d[e]) && !_.isBoolean(o.d[e]) && !_.isNull(o.d[e])) {
							throw this._handleError("invalidValue", { msg: `d.${e} has a forbidden type. Only strings, numbers, boolean and null are allowed.` });
						}
					}
					break;
				}
				default: {
					break;
				}
			}
		}
	}

	// Wipe old sessions
	//
	// Called by internal housekeeping every `options.wipe` seconds
	private _wipe = async () => {
		if (!this.connected) {
			this.connected = await this.toConnect;
		}

		const resp = await this.redis.zRangeByScore(`${this.redisns}SESSIONS`, "-inf", this._now());
		if (resp.length > 0) {
			for (const element of resp) {
				const e = element.split(":");
				const options = {
					app: e[0],
					token: e[1],
					id: e[2]
				};
				await this._kill(options);
			}
		}
		return;
	};
}


export default RedisSessions;
