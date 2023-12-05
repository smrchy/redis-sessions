
import _ from "lodash";

import RedisInst from "redis";
import type { RedisClientOptions, RedisClientType } from "redis";

import { EventEmitter } from "node:events";

import NodeCache from "node-cache";
import type RedisClient from "@redis/client/dist/lib/client";

interface Options {
	port?: number;
	host?: string;
	options?: RedisClientOptions; // maybe something else
	namespace?: string;
	wipe: number;
	client: RedisClientType;// maybe something else
	cachetime: number;
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
	`client`: *optional* An external RedisClient object which will be used for the connection.
	`cachetime` (Number) *optional* Number of seconds to cache sessions in memory. Can only be used if no `client` is supplied. See the "Cache" section. Default: `0`.
*/
// extended Eventemitter before
class RedisSessions extends EventEmitter {
	private redisns: string;
	private isCache = false;
	private redis: ReturnType<typeof RedisInst.createClient>;
	private connected: boolean;
	private sessionCache: NodeCache|null = null;
	private wiperInterval: ReturnType<typeof setInterval>|null = null;
	constructor(o: Options) {
		super();
		// TODO check later function
		this.initErrors();
		this.redisns = o.namespace ?? "rs";
		this.redisns += ":";

		let isClient = false;

		if (o.client.constructor.name === "RedisClient") {
			isClient = true;
			this.redis = o.client;
		} else if (o.options && o.options.url) {
			this.redis = RedisInst.createClient(o.options);
		} else {
			this.redis = RedisInst.createClient({
				socket: {
					port: o.port ?? 6379,
					host: o.host ?? "127.0.0.1"
				}
			});
			// TODO out options meaning
			// this.redis = RedisInst.createClient(o.port or 6379, o.host or "127.0.0.1", o.options or {})
		}
		// maybe is open better for this case
		this.connected = this.redis.isOpen;

		this.redis.on("connect", () => {
			this.connected = true;
			this.emit("connect");
			return;
		});

		this.redis.on("error", (err) => {
			if (err.message.indexOf("ECONNREFUSED")) {
				this.connected = false;
				this.emit("disconnect");
			} else {
				console.error("Redis ERROR", err);
				this.emit("error");
			}
			return;
		});

		let redissub;
		if (o.cachetime) {
			if (isClient) { console.log("Warning: Caching is disabled. Must not supply `client` option"); } else {
				// o.cachetime = parseInt(o.cachetime, 10)
				if (o.cachetime > 0) {
					// Setup node-cache
					this.sessionCache = new NodeCache({
						stdTTL: o.cachetime,
						useClones: false
					});
					// Setup the Redis subscriber to listen for changes
					if (o.options && o.options.url) { redissub = RedisInst.createClient(o.options); } else {
						redissub = RedisInst.createClient({
							socket: {
								port: o.port ?? 6379,
								host: o.host ?? "127.0.0.1"
							}
						});
						// redissub = RedisInst.createClient(o.port or 6379, o.host or "127.0.0.1", o.options or {})
					}
					// Setup the listener for change messages
					redissub.on("message", (c, m) => { // Message will only contain a `{app}:{token}` string. Just delete it from node-cache.
						this.sessionCache.del(m);
						return;
					});
					// Setup the subscriber
					this.isCache = true;
					// redissub.subscribe("#{@redisns}cache")
				}
			}
		}
		if (o.wipe !== 0) {
			let wipe = o.wipe || 600;
			if (wipe < 10) {
				wipe = 10;
			}
			this.wiperInterval = setInterval(this._wipe, wipe * 1000);
			// TODO check later with function
		}
	}

	/* Activity

	Get the number of active unique users (not sessions!) within the last *n* seconds

	**Parameters:**

	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	* `dt` Delta time. Amount of seconds to check (e.g. 600 for the last 10 min.)
	*/
	public activity = async (options: {app: string; dt: number}, cb: Function) => {
		if (this.validate(options, ["app", "dt"], cb) === false) {
			// return;
			throw new Error("Please use correct parameters");
		}
		// this.redis.zCount(`${this.redisns}${options.app}:_users`, this._now() - options.dt, "+inf", function (err, resp) {
		// 	if (err) {
		// 		cb(err);
		// 		return;
		// 	}
		// 	cb(null, { activity: resp });
		// 	return;
		// });
		try {
			// https://github.com/StackExchange/StackExchange.Redis/issues/1034
			const count = await this.redis.zCount(`${this.redisns}${options.app}:_users`, this._now() - options.dt, "+inf");
			return count;
		} catch (error) {
			console.log(error);
			throw error;
		}
	};


	/* Create

	Creates a session for an app and id.

	**Parameters:**

	An object with the following keys:

	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	* `id` must be [a-zA-Z0-9_-] and 1-64 chars long
	* `ip` must be a valid IP4 address
	* `ttl` *optional* Default: 7200. Positive integer between 1 and 2592000 (30 days)

	**Example:**

		create({
			app: "forum",
			id: "user1234",
			ip: "156.78.90.12",
			ttl: 3600
		}, callback)

	Returns the token when successful.
	*/

	public create = (options: {app: string; id: string; ip: string; ttl: number; d?: Record<string, unknown>; no_resave?: boolean}, cb: Function) => {
		options.d = options.d || { ___duMmYkEy: null };
		const optionsEval = this.validate(options, [
			"app",
			"id",
			"ip",
			"ttl",
			"d",
			"no_resave"
		], cb);
		if (optionsEval === false) {
			return;
		}
		const token = this._createToken();
		// Prepopulate the multi statement
		const mc = this._createMultiStatement(options.app, token, options.id, options.ttl, false);
		mc.push([
			"sadd",
			"#{@redisns}#{options.app}:us:#{options.id}",
			token
		]);
		// Create the default session hash
		let thesession = [
			"hmset",
			"#{@redisns}#{options.app}:#{token}",
			"id",
			options.id,
			"r",
			1,
			"w",
			1,
			"ip",
			options.ip,
			"la",
			this._now(),
			"ttl",
			// parseInt(options.ttl),
			options.ttl
		];
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
				thesession = [
					...thesession,
					"d",
					JSON.stringify(options.d)
				];
			}
		}
		// Check for `no_resave` #36
		if (options.no_resave) {
			thesession.push("no_resave", 1);
		}
		mc.push(thesession);
		// Run the redis statement
		// this.redis.multi(mc).exec (err, resp) ->
		// 	if err
		// 		cb(err)
		// 		return
		// 	if resp[4] isnt "OK"
		// 		cb("Unknow error")
		// 		return
		// 	cb(null, { token: token })
		// 	return
		// return
		try {
			const resp = this.redis.multiExecutor(mc);
			cb(resp);
		} catch (error) {
			cb(error);
			console.log(error);
			// throw error;
		}
	};

	/* Get

	Get a session for an app and token.

	**Parameters:**

	An object with the following keys:

	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	* `token` must be [a-zA-Z0-9] and 64 chars long
	*/
	public get = (options: {app: string; token: string; _nochache?: boolean}, cb: Function) => {
		const optionsEval = this._validate(options, ["app", "token"], cb);
		if (optionsEval === false) {
			return;
		}
		const cachekey = `${options.app}:${options.token}`;
		if (this.isCache && !options._nocache) {
			// Try to find the session in cache
			const cache = this.sessionCache.get(cachekey);
			if (cache !== undefined) {
				cb(null, cache);
				return;
			}
		}
		const thekey = `${this.redisns}${cachekey}`;
		try {
			const resp = this.redis.hmGet(thekey, [
				"id",
				"r",
				"w",
				"ttl",
				"d",
				"la",
				"ip",
				"no_resave"
			]);
			const o = this._prepareSession(resp)
			if (o === null){
				cb(null, {})
				return
			}
			if (this.isCache){
				this.sessionCache.set(cachekey, o);
			}
			// Secret switch to disable updating the stats - we don't need this when we kill a session
			if(options._noupdate){
				cb(null, o)
				return
			}
			// Update the counters
			const mc = this._createMultiStatement(options.app, options.token, o.id, o.ttl, o.no_resave)
			mc.push(["hincrby", thekey, "r", 1])
			if (o.idle > 1){
				mc.push(["hset", thekey, "la", @_now()])
			}
			try {
				const response = await this.redis.multiExecutor(mc);
				cb(null,o);
			} catch (error) {
				cb(error);
			}
			
		} catch (error) {
			cb(error);
		}
		// this.redis.hmget thekey, "id", "r", "w", "ttl", "d", "la", "ip", "no_resave", (err, resp) =>
		// 	if err
		// 		cb(err)
		// 		return
		// 	// Prepare the data
		// 	o = @_prepareSession(resp)
		// 	if o is null
		// 		cb(null, {})
		// 		return
		// 	if @iscache
		// 		@sessioncache.set(cachekey, o)
		// 	# Secret switch to disable updating the stats - we don't need this when we kill a session
		// 	if options._noupdate
		// 		cb(null, o)
		// 		return
		// 	# Update the counters
		// 	mc = @_createMultiStatement(options.app, options.token, o.id, o.ttl, o.no_resave)
		// 	mc.push(["hincrby", thekey, "r", 1])
		// 	if o.idle > 1
		// 		mc.push(["hset", thekey, "la", @_now()])
		// 	@redis.multi(mc).exec (err, resp) ->
		// 		if err
		// 			cb(err)
		// 			return
		// 		cb(null, o)
		// 		return
		// 	return
		// return
		return;
	};

	private _no_resave_check = (session, options, cb, done) =>{
		if ( !session.no_resave){
			done()
			return
		}
		// Check if the session has run out
		try {
			const resp = await this.redis.zScore(`${this.redisns}SESSIONS`, `${options.app}:${options.token}:${session.id}`);
			if (resp===null||resp< this._now()) {
				cb(null,{});
				return;
			}
		} catch (error) {
			cb(error);
		}
		// @redis.zscore "#{@redisns}SESSIONS", "#{options.app}:#{options.token}:#{session.id}", (err, resp) =>
		// 	if err
		// 		cb(err)
		// 		return
		// 	if resp is null or resp < @_now()
		// 		# Session has run out.
		// 		cb(null, {})
		// 		return
		// 	done()
		// 	return
		// return
		}
}
