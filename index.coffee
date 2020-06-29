_ = require "lodash"
RedisInst = require "redis"
EventEmitter = require("events").EventEmitter
NodeCache = require "node-cache"

# # RedisSessions
#
# To create a new instance use:
#
# 	RedisSessions = require("redis-sessions")
#	rs = new RedisSessions()
#
#	Parameters:
#
#	`port`: *optional* Default: `6379`. The Redis port.
#	`host`, *optional* Default: `127.0.0.1`. The Redis host.
#	`options`, *optional* Default: `{}`. Additional options. See [https://github.com/mranney/node_redis#rediscreateclientport-host-options](redis.createClient))
#	`namespace`: *optional* Default: `rs`. The namespace prefix for all Redis keys used by this module.
#	`wipe`: *optional* Default: `600`. The interval in second after which the timed out sessions are wiped. No value less than 10 allowed.
#	`client`: *optional* An external RedisClient object which will be used for the connection.
#	`cachetime` (Number) *optional* Number of seconds to cache sessions in memory. Can only be used if no `client` is supplied. See the "Cache" section. Default: `0`.
#
class RedisSessions extends EventEmitter

	constructor: (o = {}) ->
		super o
		@_initErrors()
		@redisns = o.namespace or "rs"
		@redisns = @redisns + ":"
		@wiperinterval = null
		@sessioncache = null
		@iscache = false
		isclient = false
		if o.client?.constructor?.name is "RedisClient"
			isclient = true
			@redis = o.client
		else if o.options and o.options.url
			@redis = RedisInst.createClient(o.options)
		else
			@redis = RedisInst.createClient(o.port or 6379, o.host or "127.0.0.1", o.options or {})

		@connected = @redis.connected or false
		@redis.on "connect", =>
			@connected = true
			@emit( "connect" )
			return

		@redis.on "error", ( err ) =>
			if err.message.indexOf( "ECONNREFUSED" )
				@connected = false
				@emit( "disconnect" )
			else
				console.error( "Redis ERROR", err )
				@emit( "error" )
			return

		if o.cachetime
			if isclient
				console.log("Warning: Caching is disabled. Must not supply `client` option")
			else
				o.cachetime = parseInt(o.cachetime, 10)
				if o.cachetime > 0
					# Setup node-cache
					@sessioncache = new NodeCache({
						stdTTL: o.cachetime
						useClones: false
					})
					# Setup the Redis subscriber to listen for changes
					if o.options and o.options.url
						redissub = RedisInst.createClient(o.options)
					else
						redissub = RedisInst.createClient(o.port or 6379, o.host or "127.0.0.1", o.options or {})
					# Setup the listener for change messages
					redissub.on "message", (c, m) =>
						# Message will only contain a `{app}:{token}` string. Just delete it from node-cache.
						@sessioncache.del(m)
						return
					# Setup the subscriber
					@iscache = true
					redissub.subscribe("#{@redisns}cache")
		if o.wipe isnt 0
			wipe = o.wipe or 600
			if wipe < 10
				wipe = 10
			@wiperinterval = setInterval(@_wipe, wipe * 1000)


	# ## Activity
	#
	# Get the number of active unique users (not sessions!) within the last *n* seconds
	#
	# **Parameters:**
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `dt` Delta time. Amount of seconds to check (e.g. 600 for the last 10 min.)
	activity: (options, cb) =>
		if @_validate(options, ["app", "dt"], cb) is false
			return
		@redis.zcount "#{@redisns}#{options.app}:_users", @_now() - options.dt, "+inf", (err, resp) ->
			if err
				cb(err)
				return
			cb(null, { activity: resp })
			return
		return

	# ## Create
	#
	# Creates a session for an app and id.
	#
	# **Parameters:**
	#
	# An object with the following keys:
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `id` must be [a-zA-Z0-9_-] and 1-64 chars long
	# * `ip` must be a valid IP4 address
	# * `ttl` *optional* Default: 7200. Positive integer between 1 and 2592000 (30 days)
	#
	# **Example:**
	#
	#	create({
	#		app: "forum",
	#		id: "user1234",
	#		ip: "156.78.90.12",
	#		ttl: 3600
	#	}, callback)
	#
	# Returns the token when successful.

	create: (options, cb) =>
		options.d = options.d or { ___duMmYkEy: null }
		options = @_validate(options, ["app", "id", "ip", "ttl", "d", "no_resave"], cb)
		if options is false
			return
		token = @_createToken()
		# Prepopulate the multi statement
		mc = @_createMultiStatement(options.app, token, options.id, options.ttl, false)
		mc.push(["sadd", "#{@redisns}#{options.app}:us:#{options.id}", token])
		# Create the default session hash
		thesession = [
			"hmset"
			"#{@redisns}#{options.app}:#{token}"
			"id"
			options.id
			"r"
			1
			"w"
			1
			"ip"
			options.ip
			"la"
			@_now()
			"ttl"
			parseInt(options.ttl)
		]
		if options.d
			# Remove null values
			nullkeys = []
			for e of options.d
				if options.d[e] is null
					nullkeys.push(e)
			options.d = _.omit(options.d, nullkeys)
			if _.keys(options.d).length
				thesession = thesession.concat(["d", JSON.stringify(options.d)])
		# Check for `no_resave` #36
		if options.no_resave
			thesession.push("no_resave")
			thesession.push(1)
		mc.push(thesession)
		# Run the redis statement
		@redis.multi(mc).exec (err, resp) ->
			if err
				cb(err)
				return
			if resp[4] isnt "OK"
				cb("Unknow error")
				return
			cb(null, { token: token })
			return
		return

	# ## Get
	#
	# Get a session for an app and token.
	#
	# **Parameters:**
	#
	# An object with the following keys:
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `token` must be [a-zA-Z0-9] and 64 chars long
	get: (options, cb) =>
		options = @_validate(options, ["app", "token"], cb)
		if options is false
			return
		cachekey = "#{options.app}:#{options.token}"
		if @iscache and not options._nocache
			# Try to find the session in cache
			cache = @sessioncache.get(cachekey)
			if cache isnt undefined
				cb(null, cache)
				return
		thekey = "#{@redisns}#{cachekey}"
		@redis.hmget thekey, "id", "r", "w", "ttl", "d", "la", "ip", "no_resave", (err, resp) =>
			if err
				cb(err)
				return
			# Prepare the data
			o = @_prepareSession(resp)
			if o is null
				cb(null, {})
				return
			if @iscache
				@sessioncache.set(cachekey, o)
			# Secret switch to disable updating the stats - we don't need this when we kill a session
			if options._noupdate
				cb(null, o)
				return
			# Update the counters
			mc = @_createMultiStatement(options.app, options.token, o.id, o.ttl, o.no_resave)
			mc.push(["hincrby", thekey, "r", 1])
			if o.idle > 1
				mc.push(["hset", thekey, "la", @_now()])
			@redis.multi(mc).exec (err, resp) ->
				if err
					cb(err)
					return
				cb(null, o)
				return
			return
		return

	_no_resave_check: (session, options, cb, done) ->
		if not session.no_resave
			done()
			return
		# Check if the session has run out
		@redis.zscore "#{@redisns}SESSIONS", "#{options.app}:#{options.token}:#{session.id}", (err, resp) =>
			if err
				cb(err)
				return
			if resp is null or resp < @_now()
				# Session has run out.
				cb(null, {})
				return
			done()
			return
		return
		


	# ## Kill
	#
	# Kill a session for an app and token.
	#
	# **Parameters:**
	#
	# An object with the following keys:
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `token` must be [a-zA-Z0-9] and 64 chars long
	#
	kill: (options, cb) =>
		options = @_validate(options, ["app", "token"], cb)
		if options is false
			return
		options._noupdate = true
		@get options, (err, resp) =>
			if err
				cb(err)
				return
			if not resp.id
				cb(null, { kill: 0 })
				return
			options.id = resp.id
			@_kill(options, cb)
			return
		return

	# Helper to _kill a single session
	#
	# Used by @kill and @wipe
	#
	# Needs options.app, options.token and options.id
	_kill: (options, cb) =>
		mc = [
			["zrem", "#{@redisns}#{options.app}:_sessions", "#{options.token}:#{options.id}"]
			["srem", "#{@redisns}#{options.app}:us:#{options.id}", options.token]
			["zrem", "#{@redisns}SESSIONS", "#{options.app}:#{options.token}:#{options.id}"]
			["del", "#{@redisns}#{options.app}:#{options.token}"]
			["exists", "#{@redisns}#{options.app}:us:#{options.id}"]
		]
		if @iscache
			mc.push(["publish", "#{@redisns}cache", "#{options.app}:#{options.token}"])
		@redis.multi(mc).exec (err, resp) =>
			if err
				cb(err)
				return
			# NOW. If the last reply of the multi statement is 0 then this was the last session.
			# We need to remove the ZSET for this user also:
			if resp[4] is 0
				@redis.zrem "#{@redisns}#{options.app}:_users", options.id, ->
					if err
						cb(err)
						return
					cb(null, { kill: resp[3] })
					return
			else
				cb(null, { kill: resp[3] })
			return
		return

	# ## Killall
	#
	# Kill all sessions of a single app
	#
	# Parameters:
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	#
	killall: (options, cb) =>
		options = @_validate(options, ["app"], cb)
		if options is false
			return
		# First we need to get all sessions of the app
		appsessionkey = "#{@redisns}#{options.app}:_sessions"
		appuserkey = "#{@redisns}#{options.app}:_users"
		@redis.zrange appsessionkey, 0, -1, (err, resp) =>
			if err
				cb(err)
				return
			if not resp.length
				cb(null, { kill: 0 })
				return
			globalkeys = []
			tokenkeys = []
			userkeys = []
			for e in resp
				thekey = e.split(":")
				globalkeys.push("#{options.app}:#{e}")
				tokenkeys.push("#{@redisns}#{options.app}:#{thekey[0]}")
				userkeys.push(thekey[1])
			userkeys = _.uniq(userkeys)
			ussets = for e in userkeys
				"#{@redisns}#{options.app}:us:#{e}"
			mc = [
				["zrem", appsessionkey].concat(resp)
				["zrem", appuserkey].concat(userkeys)
				["zrem", "#{@redisns}SESSIONS"].concat(globalkeys)
				["del"].concat(ussets)
				["del"].concat(tokenkeys)
			]
			if @iscache
				for e in resp
					mc.push(["publish", "#{@redisns}cache", "#{options.app}:#{e.split(":")[0]}"])
			@redis.multi(mc).exec (err, resp) ->
				if err
					cb(err)
					return
				cb(null, { kill: resp[0] })
				return
			return
		return

	# ## Kill all Sessions of Id
	#
	# Kill all sessions of a single id within an app
	#
	# Parameters:
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `id` must be [a-zA-Z0-9_-] and 1-64 chars long
	#
	killsoid: (options, cb) =>
		options = @_validate(options, ["app", "id"], cb)
		if options is false
			return
		@redis.smembers "#{@redisns}#{options.app}:us:#{options.id}", (err, resp) =>
			if err
				cb(err)
				return
			if not resp.length
				cb(null, { kill: 0 })
				return
			mc = []
			# Grab all sessions we need to get
			for token in resp
				# Add to the multi commands array
				mc.push(["zrem", "#{@redisns}#{options.app}:_sessions", "#{token}:#{options.id}"])
				mc.push(["srem", "#{@redisns}#{options.app}:us:#{options.id}", token])
				mc.push(["zrem", "#{@redisns}SESSIONS", "#{options.app}:#{token}:#{options.id}"])
				mc.push(["del", "#{@redisns}#{options.app}:#{token}"])
				if @iscache
					mc.push(["publish", "#{@redisns}cache", "#{options.app}:#{token}"])
			mc.push(["exists", "#{@redisns}#{options.app}:us:#{options.id}"])

			@redis.multi(mc).exec (err, resp) =>
				if err
					cb(err)
					return
				# get the amount of deleted sessions
				total = 0
				for e in resp[3...] by 4
					total = total + e

				# NOW. If the last reply of the multi statement is 0 then this was the last session.
				# We need to remove the ZSET for this user also:
				if _.last(resp) is 0
					@redis.zrem "#{@redisns}#{options.app}:_users", options.id, ->
						cb(null, { kill: total })
						return
				else
					cb(null, { kill: total })
				return
			return
		return

	# ## Ping
	#
	# Ping the Redis server
	ping: (cb) =>
		@redis.ping cb
		return

	# ## Quit
	#
	# Quit the Redis connection
	# This is needed if Redis-Session is used with AWS Lambda.
	quit: () =>
		if @wiperinterval isnt null
			clearInterval(@wiperinterval)
		@redis.quit()
		return

	# ## Set
	#
	# Set/Update/Delete custom data for a single session.
	# All custom data is stored in the `d` object which is a simple hash object structure.
	#
	# `d` might contain **one or more** keys with the following types: `string`, `number`, `boolean`, `null`.
	# Keys with all values except `null` will be stored. If a key containts `null` the key will be removed.
	#
	# Note: If `d` already contains keys that are not supplied in the set request then these keys will be untouched.
	#
	# **Parameters:**
	#
	# An object with the following keys:
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `token` must be [a-zA-Z0-9] and 64 chars long
	# * `d` must be an object with keys whose values only consist of strings, numbers, boolean and null.
	#

	set: (options, cb) =>
		options = @_validate(options, ["app", "token", "d", "no_resave"], cb)
		if options is false
			return
		options._noupdate = true
		options._nocache = true
		# Get the session
		@get options, (err, resp) =>
			if err
				cb(err)
				return
			if not resp.id
				cb( null, {})
				return

			# Cleanup `d`
			nullkeys = []
			for e of options.d
				if options.d[e] is null
					nullkeys.push(e)
			# OK ready to set some data
			if resp.d
				resp.d = _.extend(_.omit(resp.d, nullkeys), _.omit(options.d, nullkeys))
			else
				resp.d = _.omit(options.d, nullkeys)
			# We now have a cleaned version of resp.d ready to save back to Redis.
			# If resp.d contains no keys we want to delete the `d` key within the hash though.
			thekey = "#{@redisns}#{options.app}:#{options.token}"
			mc = @_createMultiStatement(options.app, options.token, resp.id, resp.ttl, resp.no_resave)
			mc.push(["hincrby", thekey, "w", 1])
			# Only update the `la` (last access) value if more than 1 second idle
			if resp.idle > 1
				mc.push(["hset", thekey, "la", @_now()])
			if _.keys(resp.d).length
				mc.push(["hset", thekey, "d", JSON.stringify(resp.d)])
			else
				mc.push(["hdel", thekey, "d"])
				resp = _.omit(resp, "d")
			if @iscache
				mc.push(["publish", "#{@redisns}cache", "#{options.app}:#{options.token}"])
			@redis.multi(mc).exec (err, reply) ->
				if err
					cb(err)
					return
				# Set `w` to the actual counter value
				resp.w = reply[3]
				cb(null, resp)
				return
			return
		return

	# ## Session of App
	#
	# Returns all sessions of a single app that were active within the last *n* seconds
	# Note: This might return a lot of data depending on `dt`. Use with care.
	#
	# **Parameters:**
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `dt` Delta time. Amount of seconds to check (e.g. 600 for the last 10 min.)

	soapp: (options, cb) =>
		if @_validate(options, ["app", "dt"], cb) is false
			return
		@redis.zrevrangebyscore "#{@redisns}#{options.app}:_sessions", "+inf", @_now() - options.dt, (err, resp) =>
			if err
				cb(err)
				return
			resp = for e in resp
				e.split(':')[0]
			@_returnSessions(options, resp, cb)
			return
		return

	# ## Sessions of ID (soid)
	#
	# Returns all sessions of a single id
	#
	# **Parameters:**
	#
	# An object with the following keys:
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `id` must be [a-zA-Z0-9_-] and 1-64 chars long
	#

	soid: (options, cb) =>
		options = @_validate(options, ["app", "id"], cb)
		if options is false
			return
		@redis.smembers "#{@redisns}#{options.app}:us:#{options.id}", (err, resp) =>
			if err
				cb(err)
				return
			@_returnSessions(options, resp, cb)
			return
		return

	# Helpers

	_createMultiStatement: (app, token, id, ttl, no_resave) ->
		now = @_now()
		o = [
			["zadd", "#{@redisns}#{app}:_sessions", now, "#{token}:#{id}"]
			["zadd", "#{@redisns}#{app}:_users", now, id]
			["zadd", "#{@redisns}SESSIONS", now + ttl, "#{app}:#{token}:#{id}"]
		]
		if no_resave
			o.push(["hset", "#{@redisns}#{app}:#{token}", "ttl", ttl])
		return o


	_createToken: ->
		t = ""
		# Note we don't use Z as a valid character here
		possible = "ABCDEFGHIJKLMNOPQRSTUVWXYabcdefghijklmnopqrstuvwxyz0123456789"
		for i in [0...55]
			t += possible.charAt(Math.floor(Math.random() * possible.length))

		# add the current time in ms to the very end seperated by a Z
		t + 'Z' + new Date().getTime().toString(36)

	_handleError: (cb, err, data = {}) =>
		# try to create a error Object with humanized message
		if _.isString(err)
			_err = new Error()
			_err.name = err
			_err.message = @_ERRORS?[err]?(data) or "unkown"
		else
			_err = err
		cb(_err)
		return

	_initErrors: =>
		@_ERRORS = {}
		for key, msg of @ERRORS
			@_ERRORS[key] = _.template(msg)
		return

	_now: ->
		parseInt((new Date()).getTime() / 1000)

	_prepareSession: (session) ->
		now = @_now()
		if session[0] is null
			return null
		# Create the return object
		o =
			id: session[0]
			r: Number(session[1])
			w: Number(session[2])
			ttl: Number(session[3])
			idle: now - session[5]
			ip: session[6]
		# Oh wait. If o.ttl < o.idle we need to bail out.
		if o.ttl < o.idle
			# We return an empty session object
			return null
		# Support for `no_resave` #36
		if session[7] is "1"
			o.no_resave = true
			o.ttl = o.ttl - o.idle
		# Parse the content of `d`
		if session[4]
			o.d = JSON.parse(session[4])
		return o

	_returnSessions: (options, sessions, cb) =>
		if not sessions.length
			cb(null, { sessions: [] })
			return
		mc = for e in sessions
			["hmget", "#{@redisns}#{options.app}:#{e}", "id", "r", "w", "ttl", "d", "la", "ip", "no_resave"]
		@redis.multi(mc).exec (err, resp) =>
			if err
				cb(err)
				return
			o = []
			for e in resp
				session = @_prepareSession(e)
				if session isnt null
					
					o.push(session)
			cb(null, { sessions: o })
			return
		return

	# Validation regex used by _validate
	_VALID:
		app: /^([a-zA-Z0-9_-]){3,20}$/
		id:	/^(.*?){1,128}$/
		ip:	/^.{1,39}$/
		token: /^([a-zA-Z0-9]){64}$/

	_validate: (o, items, cb) ->
		for item in items
			switch item
				when "app", "id", "ip", "token"
					if not o[item]
						@_handleError(cb, "missingParameter", { item: item })
						return false
					o[item] = o[item].toString()
					if not @_VALID[item].test(o[item])
						@_handleError(cb, "invalidFormat", { item: item })
						return false
				when "ttl"
					o.ttl = parseInt(o.ttl or 7200, 10)
					if _.isNaN(o.ttl) or not _.isNumber(o.ttl) or o.ttl < 10
						@_handleError(cb, "invalidValue", { msg: "ttl must be a positive integer >= 10" })
						return false
				when "no_resave"
					if o.no_resave is true
						o.no_resave = true
					else
						o.no_resave = false
				when "dt"
					o[item] = parseInt(o[item], 10)
					if _.isNaN(o[item]) or not _.isNumber(o[item]) or o[item] < 10
						@_handleError(cb, "invalidValue", { msg: "ttl must be a positive integer >= 10" })
						return false
				when "d"
					if not o[item]
						@_handleError(cb, "missingParameter", { item: item })
						return false
					if not _.isObject(o.d) or _.isArray(o.d)
						@_handleError(cb, "invalidValue", { msg: "d must be an object" })
						return false
					keys = _.keys(o.d)
					if not keys.length
						@_handleError(cb, "invalidValue", { msg: "d must containt at least one key." })
						return false
					# Check if every key is either a boolean, string or a number
					for e of o.d
						if not _.isString(o.d[e]) and not _.isNumber(o.d[e]) and not _.isBoolean(o.d[e]) and not _.isNull(o.d[e])
							@_handleError(cb, "invalidValue", { msg: "d.#{e} has a forbidden type. Only strings, numbers, boolean and null are allowed." })
							return false
		return o

	# Wipe old sessions
	#
	# Called by internal housekeeping every `options.wipe` seconds
	_wipe: =>
		that = @
		@redis.zrangebyscore "#{@redisns}SESSIONS", "-inf", @_now(), (err, resp) ->
			if not err and resp.length
				_.each resp, (e) ->
					e = e.split(':')
					options =
						app: e[0]
						token: e[1]
						id: e[2]
					that._kill(options, ->)
					return
				return
			return
		return

	ERRORS:
		"missingParameter": "No <%= item %> supplied"
		"invalidFormat": "Invalid <%= item %> format"
		"invalidValue": "<%= msg %>"

module.exports = RedisSessions
