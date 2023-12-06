
import _ from "lodash";

import RedisInst from "redis";
import type { RedisClientOptions, RedisClientType, } from "redis";

import { EventEmitter } from "node:events";

import NodeCache from "node-cache";
import type RedisClient from "@redis/client/dist/lib/client";

interface ConstructorOptions {
	port?: number;
	host?: string;
	options?: RedisClientOptions; // maybe something else
	namespace?: string;
	wipe: number;
	client: RedisClientType;// maybe something else
	cachetime: number;
}

interface EvaluatedOption {
	app:string;
	token?:string;
	id?:string;
	ip?:string;
	ttl?:number;
	no_resave?:boolean;
	d?: Record<string,string|number|boolean|null>;
	dt?:number;
}

interface Session {
	id: string;
	r: number;
	w: number;
	ttl: number;
	idle: number;
	ip: string;
	d?: Record<string,string|boolean|number|null>;
	no_resave?:boolean;
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
	// maybe public 
	private connected: boolean;
	private sessionCache: NodeCache|null = null;
	private wiperInterval: ReturnType<typeof setInterval>|null = null;
	private _ERRORS: Record<string,string>;
	constructor(o: ConstructorOptions) {
		super();
		// TODO check later function 
		this._initErrors();
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
		if (this._validate(options, ["app", "dt"], cb) === false) {
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

	public create = (options: {app: string; id: string; ip: string; ttl: number; d?: Record<string, string|number|boolean|null>; no_resave?: boolean}, cb: Function) => {
		options.d = options.d || { ___duMmYkEy: null };
		const optionsEval = this._validate(options, [
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
		mc.sAdd(`${this.redisns}${options.app}:us:${options.id}`,token);
		// Create the default session hash
		let thesession: Record<string,string|number>= {
			// "hmset",
			// `${this.redisns}${options.app}:${token}`,
			id:options.id,
			r:1 ,
			w:1 ,
			ip:options.ip ,
			la:this._now(),
			ttl:options.ttl
			// parseInt(options.ttl),
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
				thesession.d=JSON.stringify(options.d);
			}
		}
		// Check for `no_resave` #36
		if (options.no_resave) {
			thesession.no_resave=1;
		}
		mc.hSet(`${this.redisns}${options.app}:${token}`,thesession);
		try {
			// Run the redis statement
			const resp = await mc.exec();
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
	public get = (options: {app: string; token: string; }, cb: Function) => {
		const optionsEval = this._validate(options, ["app", "token"], cb);
		if (optionsEval === false) {
			return;
		}
		const cachekey = `${options.app}:${options.token}`;
		if (this.isCache && !optionsEval._nocache) {
			// Try to find the session in cache
			const cache = this.sessionCache.get(cachekey);
			if (cache !== undefined) {
				cb(null, cache);
				return;
			}
		}
		const thekey = `${this.redisns}${cachekey}`;
		try {
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
			const o = this._prepareSession(resp)
			if (o === null){
				cb(null, {})
				return
			}
			if (this.isCache){
				this.sessionCache.set(cachekey, o);
			}
			// Secret switch to disable updating the stats - we don't need this when we kill a session
			if(optionsEval._noupdate){
				cb(null, o)
				return
			}
			// Update the counters
			const mc = this._createMultiStatement(options.app, options.token, o.id, o.ttl, o.no_resave)
			mc.push(["hincrby", thekey, "r", 1])
			if (o.idle > 1){
				mc.push(["hset", thekey, "la", this._now()])
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
		return;
	};

	// TODO patrick fragen ob man die braucht
	private _no_resave_check(session:Session, options:{app:string,token:string}, cb:Function, done:Function) {
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
			done();
			return;
		} catch (error) {
			cb(error);
		}
		}
	/* Kill
	
	Kill a session for an app and token.
	
	**Parameters:**
	
	An object with the following keys:
	
	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	* `token` must be [a-zA-Z0-9] and 64 chars long
	*/
	// TODO after get
	public kill= (options:{app:string,token:string}, cb:Function) =>{
		const optionsEval = this._validate(options, ["app", "token"], cb)
		if (optionsEval === false){
			return
		}
		optionsEval._noupdate = true
		this.get(options, (err: Error, resp:Record<string,unknown>) =>{
			if(err){
				cb(err);
				return
			}
			if(!resp.id){
				cb(null, { kill: 0 })
				return
			}
			optionsEval.id = resp.id
			this._kill(optionsEval, cb)
			return})
		return
	}

	/* Helper to _kill a single session
	
	Used by @kill and @wipe
	
	Needs options.app, options.token and options.id
	*/

	private _kill= (options:{app:string,token:string,id:string}, cb:Function) =>{
		const mc = this.redis.multi();
		mc.zRem(`${this.redisns}${options.app}:_sessions`, `${options.token}:${options.id}`)
		mc.sRem(`${this.redisns}${options.app}:us:${options.id}`, options.token)
		mc.zRem(`${this.redisns}SESSIONS`, `${options.app}:${options.token}:${options.id}`)
		mc.del(`${this.redisns}${options.app}:${options.token}`)
		mc.exists(`${this.redisns}${options.app}:us:${options.id}`)
		if (this.isCache){
			mc.publish(`${this.redisns}cache`, `${options.app}:${options.token}`)
		}
		try {
			const resp= await mc.exec();
			if (resp[4]===0) {
				try {
					this.redis.zRem(`${this.redisns}${options.app}:_users`, options.id);
				} catch (error) {
					cb(error);
					return;
				}
			}
		} catch (error) {
			cb(error)
			return
		}
		
		return
	}

	/* Killall
	
	Kill all sessions of a single app
	
	Parameters:
	
	* `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	*/
	public killall= (options:{app:string;}, cb:Function) =>{
		const optionsEval = this._validate(options, ["app"], cb)
		if (optionsEval === false){
			return
		}
		// First we need to get all sessions of the app
		const appsessionkey = `${this.redisns}${options.app}:_sessions`
		const appuserkey = `${this.redisns}${options.app}:_users`
		try {
			const resp = await this.redis.zRange(appsessionkey,0,-1);
			if(!resp.length){
				cb(null, { kill: 0 })
				return
			}
			const globalkeys = []
			const tokenkeys = []
			let userkeys = []
			for(const e in resp){
				const thekey = e.split(":")
				globalkeys.push(`${options.app}:${e}`)
				tokenkeys.push(`${this.redisns}${options.app}:${thekey[0]}`)
				userkeys.push(thekey[1])
			}
			userkeys = _.uniq(userkeys)
			const ussets: string[] = [];
			for(const e in userkeys){
				ussets.push(`${this.redisns}${options.app}:us:${e}`);
			}
			// TODO still c heck if comands execute ptoperly
			const mc = this.redis.multi();
			mc.zRem(appsessionkey,resp);
			mc.zRem (appuserkey,userkeys)
			mc.zRem (`${this.redisns}SESSIONS`,globalkeys)
			mc.del(ussets)
			mc.del(tokenkeys)

			if (this.isCache){
				for( const e in resp){
					mc.publish(`${this.redisns}cache`, `${options.app}:${e.split(":")[0]}`)
				}
			}
			try {
				const resp = await mc.exec();
				cb(null,{kill:resp[0]})
			} catch (error) {
				cb(error)
			}
			return
		} catch (error) {
			cb(error)
		}
		return
	}

	/* Kill all Sessions of Id
	#
	# Kill all sessions of a single id within an app
	#
	# Parameters:
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `id` must be [a-zA-Z0-9_-] and 1-64 chars long
	*/
	public killsoid= (options:{app:string,id:string}, cb: Function) =>{
		const optionsEval = this._validate(options, ["app", "id"], cb)
		if(optionsEval === false){
			return
		}
		try {
			const resp = await this.redis.sMembers(`${this.redisns}${options.app}:us:${options.id}`);
			if (!resp.length) {
				cb(null, { kill: 0 })
				return
			}
			const mc = this.redis.multi();
			// Grab all sessions we need to get
			for(const token in resp){
				// Add the multi commands
				mc.zRem(`${this.redisns}${options.app}:_sessions`, `${token}:${options.id}`);
				mc.sRem (`${this.redisns}${options.app}:us:${options.id}`, token);
				mc.zRem(`${this.redisns}SESSIONS`, `${options.app}:${token}:${options.id}`);
				mc.del(`${this.redisns}${options.app}:${token}`)
				if(this.isCache){
					mc.publish(`${this.redisns}cache`, `${options.app}:${token}`)
				}
			}
			mc.exists(`${this.redisns}${options.app}:us:${options.id}`)

			try {
				const response = await mc.exec();
				// get the amount of deleted sessions

				let total=0;
				const ref = response.slice(3)
				for(let k=0;k<ref.length;k+=4){
					// string parse stuff TODO
					const e = ref[k];
					if (typeof e === "number") {
						total+=e;
					} else {
						// TODO maybe error
					}
				}

				// NOW. If the last reply of the multi statement is 0 then this was the last session.
				// We need to remove the ZSET for this user also:
				if (_.last(response) === 0) {
					await this.redis.zRem(`${this.redisns}${options.app}:_users`, options.id);
					cb(null, { kill: total })
					return
				}
				else{
					cb(null, { kill: total })
				}
			} catch (error) {
				cb(error)
			}
		} catch (error) {
			cb(error)
		}
		return
	}

	// Ping
	//
	// Ping the Redis server
	public ping(cb:Function) {
		cb(await this.redis.ping());
	}

	// Quit
	//
	// Quit the Redis connection
	// This is needed if Redis-Session is used with AWS Lambda.
	public quit = () =>{
		if (this.wiperInterval !== null){
			clearInterval(this.wiperInterval)
		}
		this.redis.quit()
		return
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
	*/
	// TODO Look at afetr get
	public set = (options:{
		app:string,
		token:string,
		d: Record<string,string|number|boolean|null>,
		// TODO fragen ob no resave hieer möglich
	}, cb:Function) =>{
		const optionsEval = this._validate(options, ["app", "token", "d", "no_resave"], cb)
		if (optionsEval === false){
			return
		}
		optionsEval._noupdate = true
		optionsEval._nocache = true
		// Get the session
		this.get(optionsEval, (err:Error, resp: Record<string,unknown>) =>{
			if (err){
				cb(err)
				return
			}
			if (!resp.id){
				cb( null, {})
				return
			}

			// Cleanup `d`
			const nullkeys:string[] = []
			for (const e of Object.keys(options.d))
				if (options.d[e] === null){
					nullkeys.push(e)
				}
			// OK ready to set some data
			if (resp.d){
				resp.d = _.extend(_.omit(resp.d, nullkeys), _.omit(options.d, nullkeys))
			}
			else{
				resp.d = _.omit(options.d, nullkeys)
			}
			// We now have a cleaned version of resp.d ready to save back to Redis.
			// If resp.d contains no keys we want to delete the `d` key within the hash though.
			const thekey = `${this.redisns}${options.app}:${options.token}`
			const mc = this._createMultiStatement(options.app, options.token, resp.id, resp.ttl, resp.no_resave)
			mc.hIncrBy(thekey, "w", 1)
			// Only update the `la` (last access) value if more than 1 second idle
			if (resp.idle > 1){
				mc.hSet(thekey, "la", this._now())
			}
			if (_.keys(resp.d).length){
				mc.hSet(thekey, "d", JSON.stringify(resp.d))
			}
			else{
				mc.hDel(thekey, "d")
				resp = _.omit(resp, "d")
			}
			if(this.isCache){

				mc.publish(`${this.redisns}cache`, `${options.app}:${options.token}`)
			}
			try {
				const reply = mc.exec();
				resp.w=reply[3];
				cb(null,resp);
			} catch (error) {
				cb(error);
			}
			return
		})
		return
	}

	/* Session of App
	
	 Returns all sessions of a single app that were active within the last *n* seconds
	 Note: This might return a lot of data depending on `dt`. Use with care.
	
	 **Parameters:**
	
	 * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	 * `dt` Delta time. Amount of seconds to check (e.g. 600 for the last 10 min.)
	*/

	public soapp= (options:{
		app:string,
		dt:number
	}, cb:Function) =>{
		if (this._validate(options, ["app", "dt"], cb) === false){
			return
		}
		try {
			// TODO https://redis.io/commands/zrevrangebyscore/
			const resp = await this.redis.zRange(`${this.redisns}${options.app}:_sessions`, this._now() - options.dt, "+inf",{
				BY: "SCORE",
				REV: true
			});
			const result: string[]= []
			for(const e in resp){
				result.push(e.split(':')[0])
			}
			this._returnSessions(options, result, cb)
		} catch (error) {
			cb(error)
		}
		return
	}

	/* Sessions of ID (soid)
	
	 Returns all sessions of a single id
	
	 **Parameters:**
	
	 An object with the following keys:
	
	 * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	 * `id` must be [a-zA-Z0-9_-] and 1-64 chars long
	*/

	public soid = (options:{app:string,id:string}, cb:Function) =>{
		if (this._validate(options, ["app", "id"], cb) === false){
			return
		}
		try {
			const resp = await this.redis.sMembers(`${this.redisns}${options.app}:us:${options.id}`);
			this._returnSessions(options, resp, cb)
		} catch (error) {
			cb(error)
		}
		return
	}

	// Helpers

	private _createMultiStatement= (app:string, token:string, id:string, ttl:number, no_resave?:boolean) =>{
		const now = this._now()
		const multi = this.redis.multi()
		multi.zAdd(`${this.redisns}${app}:_sessions`, {score:now,value:`${token}:${id}`})
		multi.zAdd(`${this.redisns}${app}:_users`,{score:now,value:id})
		multi.zAdd(`${this.redisns}SESSIONS`, {score: now + ttl, value: `${app}:${token}:${id}`})
		if (no_resave){
			multi.hSet(`${this.redisns}${app}:${token}`, "ttl", ttl)
		}
		return multi
	}

	private _createToken=() =>{
		let t = ""
		// Note we don't use Z as a valid character here
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYabcdefghijklmnopqrstuvwxyz0123456789"
		for(let i=0;i<56;i++) {
			t += possible.charAt(Math.floor(Math.random() * possible.length))
		}

		// add the current time in ms to the very end seperated by a Z
		t + 'Z' + new Date().getTime().toString(36)
		return t;
	}

	private _handleError= (cb:Function, err:Error|string, data = {}) =>{
		// try to create a error Object with humanized message
		if( _.isString(err)){
			const _err = new Error()
			_err.name = err
			_err.message = this._ERRORS?[err]?(data)| "unkown";
		} else{
			const _err = err
			cb(_err)
		}
		return
	}

	private _initErrors= ()=>{
		this._ERRORS = {}
		for (const [key, msg] of this.ERRORS){
			this._ERRORS[key] = _.template(msg)
		}
		return
	}

	private _now(){
		return parseInt(""+(Date.now()/1000),10);
	}

	private _prepareSession(session:(string|null)[]){
		const now = this._now();
		if (session[0] === null) {
			return null
		}
		if (session[6]===null) {
			// TODO look up if this is needed
			throw new Error("Unsure");
		}
		// Create the return object
		const o:Session = {
			id: session[0].toString(),
			r: Number(session[1]),
			w: Number(session[2]),
			ttl: Number(session[3]),
			idle: now - Number(session[5]),
			ip: session[6],
		};
		// Oh wait. If o.ttl < o.idle we need to bail out.
		if (o.ttl < o.idle){
			// We return an empty session object
			return null
		}
		// Support for `no_resave` #36
		if (session[7] === "1"){
			o.no_resave = true
			o.ttl = o.ttl - o.idle
		}
		// Parse the content of `d`
		if(session[4]){
			o.d = JSON.parse(session[4])
		}
		return o
	} 

	// TODO refine options maybe
	private _returnSessions(options:{app:string}, sessions:string[], cb:Function) {
		if (!sessions.length){
			cb(null, { sessions: [] })
			return
		}
		const mc = this.redis.multi();
		for (const e in sessions){
			mc.hmGet(`${this.redisns}${options.app}:${e}`,[ "id", "r", "w", "ttl", "d", "la", "ip", "no_resave"])
		}
		try {
			const resp = await mc.exec();
			const o = []
			for(const e of resp){
				if (Array.isArray(e)) {
					// TODO typeing into number|string|null|
					const result: (string|null)[] = []
					for(const reply of e){
						// maybe check for buffer?
						if (typeof reply === "string"||typeof reply ==="boolean") {
							result.push(reply.toString());
						} else if(reply === null){
							result.push(reply);
						} else {
							// should not happen maybe throw error;
						}
					}
					const session = this._prepareSession(result)
					if(session){
						o.push(session)
					}
				} else {
					// TODO dont know how this can happen but propably error
				}
			}
			cb(null, {sessions:o})
		} catch (error) {
			cb(error);
		}
		return
	}

	// Validation regex used by _validate
	private VALID = {
		app: /^([a-zA-Z0-9_-]){3,20}$/,
		id:	/^(.*?){1,128}$/,
		ip:	/^.{1,39}$/,
		token: /^([a-zA-Z0-9]){64}$/
	}

	private _validate(o:EvaluatedOption, items:string[], cb:Function) {
		const optionEval:EvaluatedOption = {
			app:"",
		}
		for (const item of items){
			switch (item) {
				case "app":
				case "id":
				case "ip":
				case "token":
					const value = o[item];
					if(!value){
						this._handleError(cb, "missingParameter", { item: item })
						return false
					}
					optionEval[item] = value.toString()
					if ( this.VALID[item].test(value)){
						this._handleError(cb, "invalidFormat", { item: item })
						return false
					}
					break;
				case "ttl":
					optionEval.ttl = parseInt(o.ttl ? `${o.ttl}`:"7200", 10)
					if (_.isNaN(optionEval.ttl) || !_.isNumber(optionEval.ttl) || optionEval.ttl < 10){
						this._handleError(cb, "invalidValue", { msg: "ttl must be a positive integer >= 10" })
						return false
					}
					break;
				case "no_resave":
					if (o.no_resave === true){
						optionEval.no_resave = true
					}else {
						optionEval.no_resave = false
					}
					break;
				case "dt":
					// TODO check if typescrpts fault or my fault dt instad of [item]
					optionEval.dt = parseInt(`${o[item]}`, 10)
					if (_.isNaN(optionEval[item])|| !_.isNumber(optionEval[item]) || optionEval.dt < 10){
						this._handleError(cb, "invalidValue", { msg: "ttl must be a positive integer >= 10" })
						return false
					}
					break;
				case "d":
					if (!o[item]){
						this._handleError(cb, "missingParameter", { item: item })
						return false
					}
					if (!_.isObject(o.d) || _.isArray(o.d)){
						this._handleError(cb, "invalidValue", { msg: "d must be an object" })
						return false
					}
					const keys = _.keys(o.d)
					if (! keys.length){
						this._handleError(cb, "invalidValue", { msg: "d must containt at least one key." })
						return false
					}
					// Check if every key is either a boolean, string or a number
					for(const e of Object.keys(o.d)){
						if (!_.isString(o.d[e]) && _.isNumber(o.d[e]) && !_.isBoolean(o.d[e]) && !_.isNull(o.d[e])){
							this._handleError(cb, "invalidValue", { msg: "d.#{e} has a forbidden type. Only strings, numbers, boolean and null are allowed." })
							return false
						}
					}
					break;
				default:
					break;
			}
		}
		return optionEval;
	}

	// Wipe old sessions
	//
	// Called by internal housekeeping every `options.wipe` seconds
	private _wipe(){
		const that = this;
		try {
			const resp = await this.redis.zRangeByScore(`${this.redisns}SESSIONS`, "-inf", this._now())
			if (!resp.length) {
				resp.forEach((element)=>{
					const e = element.split(":");
					const options = {
						app: e[0],
						token: e[1],
						id: e[2]
					}
					that._kill(options,()=>{});
				})
			}
		} catch (error) {
			console.log(error)
			return
		}
		return
	}

	public ERRORS = {
		"missingParameter": "No <%= item %> supplied",
		"invalidFormat": "Invalid <%= item %> format",
		"invalidValue": "<%= msg %>",
	}

}

	module.exports = RedisSessions
