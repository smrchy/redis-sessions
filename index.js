  /*
  Redis Sessions

  The MIT License (MIT)

  Copyright © 2013-2018 Patrick Liess, http://www.tcs.de

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */
var EventEmitter, RedisInst, RedisSessions, _,
  boundMethodCheck = function(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new Error('Bound instance method accessed before binding'); } };

_ = require("lodash");

RedisInst = require("redis");

EventEmitter = require("events").EventEmitter;

RedisSessions = (function() {
  // # RedisSessions

  // To create a new instance use:

  // 	RedisSessions = require("redis-sessions")
  //	rs = new RedisSessions()

  //	Parameters:

  //	`port`: *optional* Default: 6379. The Redis port.
  //	`host`, *optional* Default: "127.0.0.1". The Redis host.
  //	`options`, *optional* Default: {}. Additional options. See [https://github.com/mranney/node_redis#rediscreateclientport-host-options](redis.createClient))
  //	`namespace`: *optional* Default: "rs". The namespace prefix for all Redis keys used by this module.
  //	`wipe`: *optional* Default: 600. The interval in second after which the timed out sessions are wiped. No value less than 10 allowed.
  //	`client`: *optional* An external RedisClient object which will be used for the connection.

  class RedisSessions extends EventEmitter {
    constructor(o = {}) {
      var ref, ref1, wipe;
      super(o);
      // ## Activity

      // Get the number of active unique users (not sessions!) within the last *n* seconds

      // **Parameters:**

      // * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
      // * `dt` Delta time. Amount of seconds to check (e.g. 600 for the last 10 min.)
      this.activity = this.activity.bind(this);
      // ## Create

      // Creates a session for an app and id.

      // **Parameters:**

      // An object with the following keys:

      // * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
      // * `id` must be [a-zA-Z0-9_-] and 1-64 chars long
      // * `ip` must be a valid IP4 address
      // * `ttl` *optional* Default: 7200. Positive integer between 1 and 2592000 (30 days)

      // **Example:**

      //	create({
      //		app: "forum",
      //		id: "user1234",
      //		ip: "156.78.90.12",
      //		ttl: 3600
      //	}, callback)

      // Returns the token when successful.
      this.create = this.create.bind(this);
      // ## Get

      // Get a session for an app and token.

      // **Parameters:**

      // An object with the following keys:

      // * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
      // * `token` must be [a-zA-Z0-9] and 64 chars long
      this.get = this.get.bind(this);
      
      // ## Kill

      // Kill a session for an app and token.

      // **Parameters:**

      // An object with the following keys:

      // * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
      // * `token` must be [a-zA-Z0-9] and 64 chars long

      this.kill = this.kill.bind(this);
      // Helper to _kill a single session

      // Used by @kill and @wipe

      // Needs options.app, options.token and options.id
      this._kill = this._kill.bind(this);
      // ## Killall

      // Kill all sessions of a single app

      // Parameters:

      // * `app` must be [a-zA-Z0-9_-] and 3-20 chars long

      this.killall = this.killall.bind(this);
      // ## Kill all Sessions of Id

      // Kill all sessions of a single id within an app

      // Parameters:

      // * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
      // * `id` must be [a-zA-Z0-9_-] and 1-64 chars long

      this.killsoid = this.killsoid.bind(this);
      // ## Ping

      // Ping the Redis server
      this.ping = this.ping.bind(this);
      // ## Quit

      // Quit the Redis connection
      // This is needed if Redis-Session is used with AWS Lambda.
      this.quit = this.quit.bind(this);
      // ## Set

      // Set/Update/Delete custom data for a single session.
      // All custom data is stored in the `d` object which is a simple hash object structure.

      // `d` might contain **one or more** keys with the following types: `string`, `number`, `boolean`, `null`.
      // Keys with all values except `null` will be stored. If a key containts `null` the key will be removed.

      // Note: If `d` already contains keys that are not supplied in the set request then these keys will be untouched.

      // **Parameters:**

      // An object with the following keys:

      // * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
      // * `token` must be [a-zA-Z0-9] and 64 chars long
      // * `d` must be an object with keys whose values only consist of strings, numbers, boolean and null.

      this.set = this.set.bind(this);
      // ## Session of App

      // Returns all sessions of a single app that were active within the last *n* seconds
      // Note: This might return a lot of data depending on `dt`. Use with care.

      // **Parameters:**

      // * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
      // * `dt` Delta time. Amount of seconds to check (e.g. 600 for the last 10 min.)
      this.soapp = this.soapp.bind(this);
      // ## Sessions of ID (soid)

      // Returns all sessions of a single id

      // **Parameters:**

      // An object with the following keys:

      // * `app` must be [a-zA-Z0-9_-] and 3-20 chars long
      // * `id` must be [a-zA-Z0-9_-] and 1-64 chars long

      this.soid = this.soid.bind(this);
      this._handleError = this._handleError.bind(this);
      this._initErrors = this._initErrors.bind(this);
      this._returnSessions = this._returnSessions.bind(this);
      // Wipe old sessions

      // Called by internal housekeeping every `options.wipe` seconds
      this._wipe = this._wipe.bind(this);
      this._initErrors();
      this.redisns = o.namespace || "rs";
      this.redisns = this.redisns + ":";
      if (((ref = o.client) != null ? (ref1 = ref.constructor) != null ? ref1.name : void 0 : void 0) === "RedisClient") {
        this.redis = o.client;
      } else if (o.options && o.options.url) {
        this.redis = RedisInst.createClient(o.options);
      } else {
        this.redis = RedisInst.createClient(o.port || 6379, o.host || "127.0.0.1", o.options || {});
      }
      this.connected = this.redis.connected || false;
      this.redis.on("connect", () => {
        this.connected = true;
        this.emit("connect");
      });
      this.redis.on("error", (err) => {
        if (err.message.indexOf("ECONNREFUSED")) {
          this.connected = false;
          this.emit("disconnect");
        } else {
          console.error("Redis ERROR", err);
          this.emit("error");
        }
      });
      if (o.wipe !== 0) {
        wipe = o.wipe || 600;
        if (wipe < 10) {
          wipe = 10;
        }
        setInterval(this._wipe, wipe * 1000);
      }
    }

    activity(options, cb) {
      boundMethodCheck(this, RedisSessions);
      if (this._validate(options, ["app", "dt"], cb) === false) {
        return;
      }
      this.redis.zcount(`${this.redisns}${options.app}:_users`, this._now() - options.dt, "+inf", function(err, resp) {
        if (err) {
          cb(err);
          return;
        }
        cb(null, {
          activity: resp
        });
      });
    }

    create(options, cb) {
      var e, mc, nullkeys, thesession, token;
      boundMethodCheck(this, RedisSessions);
      options.d = options.d || {
        ___duMmYkEy: null
      };
      options = this._validate(options, ["app", "id", "ip", "ttl", "d", "no_resave"], cb);
      if (options === false) {
        return;
      }
      token = this._createToken();
      // Prepopulate the multi statement
      mc = this._createMultiStatement(options.app, token, options.id, options.ttl, false);
      mc.push(["sadd", `${this.redisns}${options.app}:us:${options.id}`, token]);
      // Create the default session hash
      thesession = ["hmset", `${this.redisns}${options.app}:${token}`, "id", options.id, "r", 1, "w", 1, "ip", options.ip, "la", this._now(), "ttl", parseInt(options.ttl)];
      if (options.d) {
        // Remove null values
        nullkeys = [];
        for (e in options.d) {
          if (options.d[e] === null) {
            nullkeys.push(e);
          }
        }
        options.d = _.omit(options.d, nullkeys);
        if (_.keys(options.d).length) {
          thesession = thesession.concat(["d", JSON.stringify(options.d)]);
        }
      }
      // Check for `no_resave` #36
      if (options.no_resave) {
        thesession.push("no_resave");
        thesession.push(1);
      }
      mc.push(thesession);
      // Run the redis statement
      this.redis.multi(mc).exec(function(err, resp) {
        if (err) {
          cb(err);
          return;
        }
        if (resp[4] !== "OK") {
          cb("Unknow error");
          return;
        }
        cb(null, {
          token: token
        });
      });
    }

    get(options, cb) {
      var thekey;
      boundMethodCheck(this, RedisSessions);
      options = this._validate(options, ["app", "token"], cb);
      if (options === false) {
        return;
      }
      thekey = `${this.redisns}${options.app}:${options.token}`;
      this.redis.hmget(thekey, "id", "r", "w", "ttl", "d", "la", "ip", "no_resave", (err, resp) => {
        var mc, o;
        if (err) {
          cb(err);
          return;
        }
        // Prepare the data
        o = this._prepareSession(resp);
        if (o === null) {
          cb(null, {});
          return;
        }
        // Secret switch to disable updating the stats - we don't need this when we kill a session
        if (options._noupdate) {
          cb(null, o);
          return;
        }
        // Update the counters
        mc = this._createMultiStatement(options.app, options.token, o.id, o.ttl, o.no_resave);
        mc.push(["hincrby", thekey, "r", 1]);
        if (o.idle > 1) {
          mc.push(["hset", thekey, "la", this._now()]);
        }
        this.redis.multi(mc).exec(function(err, resp) {
          if (err) {
            cb(err);
            return;
          }
          cb(null, o);
        });
      });
    }

    _no_resave_check(session, options, cb, done) {
      if (!session.no_resave) {
        done();
        return;
      }
      // Check if the session has run out
      this.redis.zscore(`${this.redisns}SESSIONS`, `${options.app}:${options.token}:${session.id}`, (err, resp) => {
        if (err) {
          cb(err);
          return;
        }
        if (resp === null || resp < this._now()) {
          // Session has run out.
          cb(null, {});
          return;
        }
        done();
      });
    }

    kill(options, cb) {
      boundMethodCheck(this, RedisSessions);
      options = this._validate(options, ["app", "token"], cb);
      if (options === false) {
        return;
      }
      options._noupdate = true;
      this.get(options, (err, resp) => {
        if (err) {
          cb(err);
          return;
        }
        if (!resp.id) {
          cb(null, {
            kill: 0
          });
          return;
        }
        options.id = resp.id;
        this._kill(options, cb);
      });
    }

    _kill(options, cb) {
      var mc;
      boundMethodCheck(this, RedisSessions);
      mc = [["zrem", `${this.redisns}${options.app}:_sessions`, `${options.token}:${options.id}`], ["srem", `${this.redisns}${options.app}:us:${options.id}`, options.token], ["zrem", `${this.redisns}SESSIONS`, `${options.app}:${options.token}:${options.id}`], ["del", `${this.redisns}${options.app}:${options.token}`], ["exists", `${this.redisns}${options.app}:us:${options.id}`]];
      this.redis.multi(mc).exec((err, resp) => {
        if (err) {
          cb(err);
          return;
        }
        // NOW. If the last reply of the multi statement is 0 then this was the last session.
        // We need to remove the ZSET for this user also:
        if (resp[4] === 0) {
          this.redis.zrem(`${this.redisns}${options.app}:_users`, options.id, function() {
            if (err) {
              cb(err);
              return;
            }
            cb(null, {
              kill: resp[3]
            });
          });
        } else {
          cb(null, {
            kill: resp[3]
          });
        }
      });
    }

    killall(options, cb) {
      var appsessionkey, appuserkey;
      boundMethodCheck(this, RedisSessions);
      options = this._validate(options, ["app"], cb);
      if (options === false) {
        return;
      }
      // First we need to get all sessions of the app
      appsessionkey = `${this.redisns}${options.app}:_sessions`;
      appuserkey = `${this.redisns}${options.app}:_users`;
      this.redis.zrange(appsessionkey, 0, -1, (err, resp) => {
        var e, globalkeys, j, len, mc, thekey, tokenkeys, userkeys, ussets;
        if (err) {
          cb(err);
          return;
        }
        if (!resp.length) {
          cb(null, {
            kill: 0
          });
          return;
        }
        globalkeys = [];
        tokenkeys = [];
        userkeys = [];
        for (j = 0, len = resp.length; j < len; j++) {
          e = resp[j];
          thekey = e.split(":");
          globalkeys.push(`${options.app}:${e}`);
          tokenkeys.push(`${this.redisns}${options.app}:${thekey[0]}`);
          userkeys.push(thekey[1]);
        }
        userkeys = _.uniq(userkeys);
        ussets = (function() {
          var k, len1, results;
          results = [];
          for (k = 0, len1 = userkeys.length; k < len1; k++) {
            e = userkeys[k];
            results.push(`${this.redisns}${options.app}:us:${e}`);
          }
          return results;
        }).call(this);
        mc = [["zrem", appsessionkey].concat(resp), ["zrem", appuserkey].concat(userkeys), ["zrem", `${this.redisns}SESSIONS`].concat(globalkeys), ["del"].concat(ussets), ["del"].concat(tokenkeys)];
        this.redis.multi(mc).exec(function(err, resp) {
          if (err) {
            cb(err);
            return;
          }
          cb(null, {
            kill: resp[0]
          });
        });
      });
    }

    killsoid(options, cb) {
      boundMethodCheck(this, RedisSessions);
      options = this._validate(options, ["app", "id"], cb);
      if (options === false) {
        return;
      }
      this.redis.smembers(`${this.redisns}${options.app}:us:${options.id}`, (err, resp) => {
        var j, len, mc, token;
        if (err) {
          cb(err);
          return;
        }
        if (!resp.length) {
          cb(null, {
            kill: 0
          });
          return;
        }
        mc = [];
// Grab all sessions we need to get
        for (j = 0, len = resp.length; j < len; j++) {
          token = resp[j];
          // Add to the multi commands array
          mc.push(["zrem", `${this.redisns}${options.app}:_sessions`, `${token}:${options.id}`]);
          mc.push(["srem", `${this.redisns}${options.app}:us:${options.id}`, token]);
          mc.push(["zrem", `${this.redisns}SESSIONS`, `${options.app}:${token}:${options.id}`]);
          mc.push(["del", `${this.redisns}${options.app}:${token}`]);
        }
        mc.push(["exists", `${this.redisns}${options.app}:us:${options.id}`]);
        this.redis.multi(mc).exec((err, resp) => {
          var e, k, len1, ref, total;
          if (err) {
            cb(err);
            return;
          }
          // get the amount of deleted sessions
          total = 0;
          ref = resp.slice(3);
          for (k = 0, len1 = ref.length; k < len1; k += 4) {
            e = ref[k];
            total = total + e;
          }
          // NOW. If the last reply of the multi statement is 0 then this was the last session.
          // We need to remove the ZSET for this user also:
          if (_.last(resp) === 0) {
            this.redis.zrem(`${this.redisns}${options.app}:_users`, options.id, function() {
              cb(null, {
                kill: total
              });
            });
          } else {
            cb(null, {
              kill: total
            });
          }
        });
      });
    }

    ping(cb) {
      boundMethodCheck(this, RedisSessions);
      this.redis.ping(cb);
    }

    quit() {
      boundMethodCheck(this, RedisSessions);
      this.redis.quit();
    }

    set(options, cb) {
      boundMethodCheck(this, RedisSessions);
      options = this._validate(options, ["app", "token", "d", "no_resave"], cb);
      if (options === false) {
        return;
      }
      options._noupdate = true;
      // Get the session
      this.get(options, (err, resp) => {
        var e, mc, nullkeys, thekey;
        if (err) {
          cb(err);
          return;
        }
        if (!resp.id) {
          cb(null, {});
          return;
        }
        // Cleanup `d`
        nullkeys = [];
        for (e in options.d) {
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
        thekey = `${this.redisns}${options.app}:${options.token}`;
        mc = this._createMultiStatement(options.app, options.token, resp.id, resp.ttl, resp.no_resave);
        mc.push(["hincrby", thekey, "w", 1]);
        // Only update the `la` (last access) value if more than 1 second idle
        if (resp.idle > 1) {
          mc.push(["hset", thekey, "la", this._now()]);
        }
        if (_.keys(resp.d).length) {
          mc.push(["hset", thekey, "d", JSON.stringify(resp.d)]);
        } else {
          mc.push(["hdel", thekey, "d"]);
          resp = _.omit(resp, "d");
        }
        this.redis.multi(mc).exec(function(err, reply) {
          if (err) {
            cb(err);
            return;
          }
          // Set `w` to the actual counter value
          resp.w = reply[3];
          cb(null, resp);
        });
      });
    }

    soapp(options, cb) {
      boundMethodCheck(this, RedisSessions);
      if (this._validate(options, ["app", "dt"], cb) === false) {
        return;
      }
      this.redis.zrevrangebyscore(`${this.redisns}${options.app}:_sessions`, "+inf", this._now() - options.dt, (err, resp) => {
        var e;
        if (err) {
          cb(err);
          return;
        }
        resp = (function() {
          var j, len, results;
          results = [];
          for (j = 0, len = resp.length; j < len; j++) {
            e = resp[j];
            results.push(e.split(':')[0]);
          }
          return results;
        })();
        this._returnSessions(options, resp, cb);
      });
    }

    soid(options, cb) {
      boundMethodCheck(this, RedisSessions);
      options = this._validate(options, ["app", "id"], cb);
      if (options === false) {
        return;
      }
      this.redis.smembers(`${this.redisns}${options.app}:us:${options.id}`, (err, resp) => {
        if (err) {
          cb(err);
          return;
        }
        this._returnSessions(options, resp, cb);
      });
    }

    // Helpers
    _createMultiStatement(app, token, id, ttl, no_resave) {
      var now, o;
      now = this._now();
      o = [["zadd", `${this.redisns}${app}:_sessions`, now, `${token}:${id}`], ["zadd", `${this.redisns}${app}:_users`, now, id], ["zadd", `${this.redisns}SESSIONS`, now + ttl, `${app}:${token}:${id}`]];
      if (no_resave) {
        o.push(["hset", `${this.redisns}${app}:${token}`, "ttl", ttl]);
      }
      return o;
    }

    _createToken() {
      var i, j, possible, t;
      t = "";
      // Note we don't use Z as a valid character here
      possible = "ABCDEFGHIJKLMNOPQRSTUVWXYabcdefghijklmnopqrstuvwxyz0123456789";
      for (i = j = 0; j < 55; i = ++j) {
        t += possible.charAt(Math.floor(Math.random() * possible.length));
      }
      // add the current time in ms to the very end seperated by a Z
      return t + 'Z' + new Date().getTime().toString(36);
    }

    _handleError(cb, err, data = {}) {
      var _err, ref;
      boundMethodCheck(this, RedisSessions);
      // try to create a error Object with humanized message
      if (_.isString(err)) {
        _err = new Error();
        _err.name = err;
        _err.message = ((ref = this._ERRORS) != null ? typeof ref[err] === "function" ? ref[err](data) : void 0 : void 0) || "unkown";
      } else {
        _err = err;
      }
      cb(_err);
    }

    _initErrors() {
      var key, msg, ref;
      boundMethodCheck(this, RedisSessions);
      this._ERRORS = {};
      ref = this.ERRORS;
      for (key in ref) {
        msg = ref[key];
        this._ERRORS[key] = _.template(msg);
      }
    }

    _now() {
      return parseInt((new Date()).getTime() / 1000);
    }

    _prepareSession(session) {
      var now, o;
      now = this._now();
      if (session[0] === null) {
        return null;
      }
      // Create the return object
      o = {
        id: session[0],
        r: Number(session[1]),
        w: Number(session[2]),
        ttl: Number(session[3]),
        idle: now - session[5],
        ip: session[6]
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

    _returnSessions(options, sessions, cb) {
      var e, mc;
      boundMethodCheck(this, RedisSessions);
      if (!sessions.length) {
        cb(null, {
          sessions: []
        });
        return;
      }
      mc = (function() {
        var j, len, results;
        results = [];
        for (j = 0, len = sessions.length; j < len; j++) {
          e = sessions[j];
          results.push(["hmget", `${this.redisns}${options.app}:${e}`, "id", "r", "w", "ttl", "d", "la", "ip", "no_resave"]);
        }
        return results;
      }).call(this);
      this.redis.multi(mc).exec((err, resp) => {
        var j, len, o, session;
        if (err) {
          cb(err);
          return;
        }
        o = [];
        for (j = 0, len = resp.length; j < len; j++) {
          e = resp[j];
          session = this._prepareSession(e);
          if (session !== null) {
            o.push(session);
          }
        }
        cb(null, {
          sessions: o
        });
      });
    }

    _validate(o, items, cb) {
      var e, item, j, keys, len;
      for (j = 0, len = items.length; j < len; j++) {
        item = items[j];
        switch (item) {
          case "app":
          case "id":
          case "ip":
          case "token":
            if (!o[item]) {
              this._handleError(cb, "missingParameter", {
                item: item
              });
              return false;
            }
            o[item] = o[item].toString();
            if (!this._VALID[item].test(o[item])) {
              this._handleError(cb, "invalidFormat", {
                item: item
              });
              return false;
            }
            break;
          case "ttl":
            o.ttl = parseInt(o.ttl || 7200, 10);
            if (_.isNaN(o.ttl) || !_.isNumber(o.ttl) || o.ttl < 10) {
              this._handleError(cb, "invalidValue", {
                msg: "ttl must be a positive integer >= 10"
              });
              return false;
            }
            break;
          case "no_resave":
            if (o.no_resave === true) {
              o.no_resave = true;
            } else {
              o.no_resave = false;
            }
            break;
          case "dt":
            o[item] = parseInt(o[item], 10);
            if (_.isNaN(o[item]) || !_.isNumber(o[item]) || o[item] < 10) {
              this._handleError(cb, "invalidValue", {
                msg: "ttl must be a positive integer >= 10"
              });
              return false;
            }
            break;
          case "d":
            if (!o[item]) {
              this._handleError(cb, "missingParameter", {
                item: item
              });
              return false;
            }
            if (!_.isObject(o.d) || _.isArray(o.d)) {
              this._handleError(cb, "invalidValue", {
                msg: "d must be an object"
              });
              return false;
            }
            keys = _.keys(o.d);
            if (!keys.length) {
              this._handleError(cb, "invalidValue", {
                msg: "d must containt at least one key."
              });
              return false;
            }
// Check if every key is either a boolean, string or a number
            for (e in o.d) {
              if (!_.isString(o.d[e]) && !_.isNumber(o.d[e]) && !_.isBoolean(o.d[e]) && !_.isNull(o.d[e])) {
                this._handleError(cb, "invalidValue", {
                  msg: `d.${e} has a forbidden type. Only strings, numbers, boolean and null are allowed.`
                });
                return false;
              }
            }
        }
      }
      return o;
    }

    _wipe() {
      var that;
      boundMethodCheck(this, RedisSessions);
      that = this;
      this.redis.zrangebyscore(`${this.redisns}SESSIONS`, "-inf", this._now(), function(err, resp) {
        if (!err && resp.length) {
          _.each(resp, function(e) {
            var options;
            e = e.split(':');
            options = {
              app: e[0],
              token: e[1],
              id: e[2]
            };
            that._kill(options, function() {});
          });
          return;
        }
      });
    }

  };

  // Validation regex used by _validate
  RedisSessions.prototype._VALID = {
    app: /^([a-zA-Z0-9_-]){3,20}$/,
    id: /^(.*?){1,128}$/,
    ip: /^.{1,39}$/,
    token: /^([a-zA-Z0-9]){64}$/
  };

  RedisSessions.prototype.ERRORS = {
    "missingParameter": "No <%= item %> supplied",
    "invalidFormat": "Invalid <%= item %> format",
    "invalidValue": "<%= msg %>"
  };

  return RedisSessions;

}).call(this);

module.exports = RedisSessions;
