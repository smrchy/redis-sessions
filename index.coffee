###
Redis Sessions

The MIT License (MIT)

Copyright © 2013 Patrick Liess, http://www.tcs.de

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
###



_ = require "underscore"
RedisInst = require "redis"

# # RedisSessions
#
# To create a new instance use:
#
# 	RedisSessions = require("redis-sessions")
#	rs = new RedisSessions()
#
#	Paramenters for RedisSessions:
#
#	`redisport`, `redishost`, `redisns`
#
# Defaults are: `6379`, `"127.0.0.1"`, `"rs:"`
#
class RedisSessions

	constructor: (redisport=6379, redishost="127.0.0.1", @redisns="rs:") ->
		@redis = RedisInst.createClient(redisport, redishost)


	# ## Activity
	#
	# Get the amount of active users within the last *n* seconds
	#
	# **Parameters:**
	#
	# * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
	# * `dt` Delta time. Amount of seconds to check (e.g. 600 for the last 10 min.)

	activity: (options, cb) =>
		if @_validate(options, ["app","dt"],cb) is false
			return
		@redis.zcount "#{@redisns}#{options.app}:_sessions", @_now() - options.dt, "+inf", (err, resp) ->
			if err
				cb(err)
				return
			cb(null, {activity: resp})
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
		options = @_validate(options, ["app","id","ip","ttl"], cb)
		if options is false
			return
		token = @_createToken()
		# Prepopulate the multi statement
		mc = @_createMultiStatement(options.app, token, options.id, options.ttl)
		# Create the default session hash
		mc.push([
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
		])
		# Run the redis statement
		@redis.multi(mc).exec (err, resp) ->
			if err 
				cb(err)
				return
			if resp[2] isnt "OK"
				cb("Unknow error")
				return
			cb(null, {token: token})
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
		options = @_validate(options, ["app","token"], cb)
		if options is false
			return
		now = @_now()
		thekey = "#{@redisns}#{options.app}:#{options.token}"
		@redis.hmget thekey, "id", "r", "w", "ttl", "d", "la", "ip", (err, resp) =>
			if err
				cb(err)
				return
			# Prepare the data
			o = @_prepareSession(resp)
			
			if o is null
				cb(null, {})
				return
			# Secret switch to disable updating the stats - we don't need this when we kill a session
			if options._noupdate
				cb(null, o)
				return
			# Update the counters
			mc = @_createMultiStatement(options.app, options.token, o.id, o.ttl)
			mc.push(["hincrby", thekey, "r", 1])
			if o.idle > 1
				mc.push(["hset", thekey, "la", now])
			@redis.multi(mc).exec (err, resp) ->
				if err
					cb(err)
					return
				cb(null, o)
				return
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
		options._noupdate = true
		@get options, (err, resp) =>
			if err
				cb(err)
				return
			if not resp.id
				cb(null, {kill: 0})
				return
			mc = [
				["zrem", "#{@redisns}#{options.app}:_sessions", "#{options.token}:#{resp.id}"]
				["zrem", "#{@redisns}SESSIONS", "#{options.app}:#{options.token}:#{resp.id}"]
				["del", "#{@redisns}#{options.app}:#{options.token}"]
			]
			@redis.multi(mc).exec (err,resp) ->
				if err
					cb(err)
					return
				if resp[0] is 1 and resp[1] is 1 and resp[2] is 1
					cb(null, {kill: 1})
				else
					cb(null, {kill: 0})
				return
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
		appkey = "#{@redisns}#{options.app}:_sessions"
		@redis.zrange appkey, 0, -1, (err, resp) =>
			if err
				cb(err)
				return
			if not resp.length
				cb(null, 0)
				return
			globalkeys = []
			tokenkeys = []
			for e in resp
				globalkeys.push("#{options.app}:#{e}")
				tokenkeys.push("#{@redisns}#{options.app}:#{e.split(':')[0]}")
			mc = [
				["zrem", appkey].concat(resp)
				["zrem", "#{@redisns}SESSIONS"].concat(globalkeys)
				["del"].concat(tokenkeys)
			]
			@redis.multi(mc).exec (err, resp) ->
				cb(null, {kill: resp[0]})
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
		options = @_validate(options, ["app","id"], cb)
		if options is false
			return

		@redis.zrevrange "#{@redisns}#{options.app}:_sessions", 0, -1, (err, resp) =>
			if err
				cb(err)
				return
			if not resp.length
				cb(null, {kill: 0})
				return
			mc = []
			# Grab all sessions we need to get
			for e in resp when e.split(':')[1] is options.id
				token = e.split(':')[0]
				# Add to the multi commands array
				mc.push(["zrem", "#{@redisns}#{options.app}:_sessions", "#{token}:#{options.id}"])
				mc.push(["zrem", "#{@redisns}SESSIONS", "#{options.app}:#{token}:#{options.id}"])
				mc.push(["del", "#{@redisns}#{options.app}:#{token}"])
			# Bail out if no sessions qualify
			if not mc.length
				cb(null, {kill: 0})

			@redis.multi(mc).exec (err, resp) =>
				if err
					cb(err)
					return
				# Make sure Redis answered with an all `1` array
				total = 0
				for e in resp
					total += e
				total = total / 3
				
				if total isnt resp.length/3
					cb("Unknow Error: " + JSON.stringify(resp), null)
					return
				cb(null, {kill: total})
				return
			return
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
		options = @_validate(options, ["app","token","d"], cb)
		if options is false
			return
		options._noupdate = true
		# Get the session
		@get options, (err,resp) =>
			if err
				cb(err)
				return
			if not resp.id
				cb( null, {})
				return

			# 
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
			mc = @_createMultiStatement(options.app, options.token, resp.id, resp.ttl)
			mc.push(["hincrby", thekey, "w", 1])
			# Only update the `la` (last access) value if more than 1 second idle
			if resp.idle > 1
				mc.push(["hset", thekey, "la", @_now()])
			if _.keys(resp.d).length
				mc.push(["hset", thekey, "d", JSON.stringify(resp.d)])
			else
				mc.push(["hdel", thekey, "d"])
				resp = _.omit(resp, "d")

			@redis.multi(mc).exec (err,reply) ->
				if err
					cb(err)
					return
				# Set `w` to the actual counter value
				resp.w = reply[2]
				cb(null, resp)
				return
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
		options = @_validate(options, ["app","id"], cb)
		if options is false
			return

		@redis.zrevrange "#{@redisns}#{options.app}:_sessions", 0, -1, (err, resp) =>
			if err
				cb(err)
				return
			if not resp.length
				cb(null, {sessions: []})
				return
			toget = []
			# Grab all sessions we need to get
			for e in resp
				if e.split(':')[1] is options.id
					toget.push(e.split(':')[0])
			# Bail out if no sessions qualify
			if not toget.length
				cb(null, {sessions: []})
				return
			# Now get all qualified sessions from Redis
			mc = for e in toget
				["hmget", "#{@redisns}#{options.app}:#{e}", "id", "r", "w", "ttl", "d", "la", "ip"]
			@redis.multi(mc).exec (err, resp) =>
				if err
					cb(err)
					return
				o = for e in resp
					@_prepareSession(e)

				cb(null, {sessions: o})
				return
			return
		return



	# Helpers

	_createMultiStatement: (app, token, id, ttl) ->
		now = @_now()
		[
			["zadd", "#{@redisns}#{app}:_sessions", now, "#{token}:#{id}"]
			["zadd", "#{@redisns}SESSIONS", now + ttl, "#{app}:#{token}:#{id}"]	
		]


	_createToken: ->
		t = ""
		# Note we don't use Z as a valid character here
		possible = "ABCDEFGHIJKLMNOPQRSTUVWXYabcdefghijklmnopqrstuvwxyz0123456789"
		for i in [0...55]
			t += possible.charAt(Math.floor(Math.random() * possible.length))

		# add the current time in ms to the very end seperated by a Z
		t + 'Z' + new Date().getTime().toString(36)
		


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
		# Parse the content of `d`
		if session[4]
			o.d = JSON.parse(session[4])
		o

	_VALID:
		app:	/^([a-zA-Z0-9_-]){3,20}$/
		id:		/^([a-zA-Z0-9_-]){1,64}$/
		ip:		/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
		token:	/^([a-zA-Z0-9]){64}$/

                    
	_validate: (o, items, cb) ->
		for item in items
			switch item
				when "app", "id", "ip", "token"
					if not o[item]
						cb("No #{item} supplied")
						return false
					o[item] = o[item].toString()
					if not @_VALID[item].test(o[item])
						cb("Invalid #{item} format")
						return false
				when "ttl"
					o.ttl = parseInt(o.ttl or 7200,10)
					if _.isNaN(o.ttl) or not _.isNumber(o.ttl) or o.ttl < 10
						cb("ttl must be a positive integer >= 10")
						return false
				when "dt"
					o[item] = parseInt(o[item],10)
					if _.isNaN(o[item]) or not _.isNumber(o[item]) or o[item] < 10
						cb("dt must be a positive integer >= 10")
						return false
				when "d"
					if not o[item]
						cb("No d supplied.")
						return false
					if not _.isObject(o.d)
						cb("d must be an object.")
						return false
					keys = _.keys(o.d)
					if not keys.length
						cb("d must containt at least one key.")
						return false
					# Check if every key is either a boolean, string or a number
					for e of o.d
						if not _.isString(o.d[e]) and not _.isNumber(o.d[e]) and not _.isBoolean(o.d[e]) and not _.isNull(o.d[e])
							cb("d.#{e} has a forbidden type. Only strings, numbers, boolean and null are allowed.")
							return false
		return o


module.exports = RedisSessions