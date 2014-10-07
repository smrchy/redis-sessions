# Redis Sessions 

[![Build Status](https://secure.travis-ci.org/smrchy/redis-sessions.svg?branch=master)](http://travis-ci.org/smrchy/redis-sessions)
[![Dependency Status](https://david-dm.org/smrchy/redis-sessions.svg)](https://david-dm.org/smrchy/redis-sessions)

[![Redis-Sessions](https://nodei.co/npm/redis-sessions.png?downloads=true&stars=true)](https://nodei.co/npm/redis-sessions/)

This is a NodeJS module to keep sessions in a Redis datastore and add some useful methods.

The main purpose of this module is to generalize sessions across application server platforms. We use nginx reverse proxy to route parts of a website to a NodeJS server and other parts could be Python, Ruby, .net, PHP, Coldfusion or Java servers. You can then use [rest-sessions](https://github.com/smrchy/rest-sessions) to access the same sessions on all app servers via a simple REST interface.

## Installation

`npm install redis-sessions`

## Basics

* Every session belongs to an app (e.g. `webapp`, `app_cust123`).
* `create`: A session is created by supplying the app and an id (usually the unique id of the user). A token will be returned.
* `get`: A session is queried with the app and token.
* `set`: Additional data (key/value) can be stored in the session.
* `kill`: A session can be killed with the app and token.
* `killall`: All sessions of an app can be killed.

## Additional methods

* `activity`: Get the amount of active sessions of an app within the last *n* seconds.
* `soid`: Get all sessions of a single id.
* `killsoid`: Kill all sessions that belong to a single id. E.g. log out user123 on all devices.
* `soapp`: Get an array of all sessions of an app which were active within the last *n* seconds.
* Automatic cleanup of old sessions.

## Performance

With Redis being run on the same machine the test script (run via `npm test`) on a 2011 iMac:

* Creates 1000 sessions in around 170ms.
* Gets those 1000 sessions and validates them in around 155ms.
* Removes those 1000 sessions in 18ms.

## Use via REST

See [rest-sessions](https://github.com/smrchy/rest-sessions).

## Use in NodeJS

### Initialize redis-sessions

```javascript
RedisSessions = require("redis-sessions");
//
// Parameters for RedisSession:
//
// e.g. rs = new RedisSession({host:"192.168.0.20"});
//
// `port`: *optional* Default: 6379. The Redis port.
// `host`, *optional* Default: "127.0.0.1". The Redis host.
// `options`, *optional* Default: {}. Additional options. See: https://github.com/mranney/node_redis#rediscreateclientport-host-options
// `namespace`: *optional* Default: "rs". The namespace prefix for all Redis keys used by this module.
// `wipe`: *optional* Default: 600. The interval in second after which the timed out sessions are wiped. No value less than 10 allowed.
// `client`: *optional* An external RedisClient object which will be used for the connection.
//
rs = new RedisSessions();

rsapp = "myapp";
```

### Create a session

Parameters:

* `app` (String) The app id (namespace) for this session.
* `id` (String) The user id of this user. Note: There can be multiple sessions for the same user id. If the user uses multiple client devices.
* `ip` (String) IP address of the user. This is used to show all ips from which the user is logged in.
* `ttl` (Number) *optional* The "Time-To-Live" for the session. Default: 7200.
* `d` (Object) *optional* Additional data to set for this sessions. (see the "set" method)

```javascript

// Set a session for `user1001`

rs.create({
  app: rsapp,
  id: "user1001",
  ip: "192.168.22.58",
  ttl: 3600},
  d: { 
    foo: "bar",
    unread_msgs: 34
  },
  function(err, resp) {
    // resp should be something like 
    // {token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"}
  });
```

### Add some data to the session

```javascript
rs.set({
  app: rsapp,
  token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe",
  d: {
    "unread_msgs": 12,
    "last_action": "/read/news",
    "birthday": "2013-08-13"
  }},
  function(err, resp) {
    /*
    resp contains the session with the new values:

    {  
      "id":"user1001",
      "r": 1,
      "w": 2,
      "idle": 1,
      "ttl": 7200, 
      "d":
        {
          "foo": "bar",
          "unread_msgs": 12,
          "last_action": "/read/news",
          "birthday": "2013-08-13"
        }
    }
    */  
  });
```


### Get a session for a token

```javascript
rs.get({
  app: rsapp,
  token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"},
  function(err, resp) {
    /*
    resp contains the session:

    {  
      "id":"user1001",
      "r": 1,  // The number of reads on this token
      "w": 1,  // The number of writes on this token
      "idle": 21,  // The idle time in seconds.
      "ttl": 7200, // Timeout after 7200 idle time
      "d":
         {
          "foo": "bar",
          "unread_msgs": 12,
          "last_action": "/read/news",
          "birthday": "2013-08-13"
        }
    }

    */
  });
```

### Set/Update/Delete

Set/Update/Delete parameters by supplying app, token and some data `d`.  
The `d` object contains a simple key/value list where values  
can be string, number, boolean or null.  
To remove keys set them to `null`, **keys that are not supplied will not be touched.**  

```javascript

rs.set({
  app: rsapp,
  token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe",
  d: {
      "unread_msgs": null
      "last_action": "/read/msg/2121"
  }},
  function(err, resp) {
    /*
    resp contains the session with modified values:

    {  
      "id":"user1001",
      "r": 1,
      "w": 2,
      "idle": 1,
      "ttl": 7200, 
      "d":
        {
          "last_action": "/read/msg/2121",
          "birthday": "2013-08-13",
          "foo": "bar"
        }
    }
    */  
  });
```

### Kill

Kill a single session by supplying app and token:

```javascript

rs.kill({
  app: rsapp,
  token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"},
  function(err, resp) {
    /*
    resp contains the result:

    {kill: 1}
    */  
  });
```

Note: If {kill: 0} is returned the session was not found.


### Activity

Query the amount of active session within the last 10 minutes (600 seconds).

```javascript

rs.activity({
  app: rsapp,
  dt: 600},
  function(err, resp) {
    /*
    resp contains the activity:

    {activity: 12}
    */  
  });
```

### Sessions of App

Get all sessions of an app there were active within the last 10 minutes (600 seconds).

```javascript

rs.soapp({
  app: rsapp,
  dt: 600},
  function(err, resp) {
    /*
    resp contains the sessions:

    { sessions: 
       [ { id: 'someuser123',
           r: 1,
           w: 1,
           ttl: 30,
           idle: 0,
           ip: '127.0.0.2'
         },
         { id: 'anotheruser456',
           r: 4,
           w: 2,
           ttl: 7200,
      	   idle: 24,
           ip: '127.0.0.1' }
        ] 
    }
    */  
  });
```

### Sessions of Id

Get all sessions within an app that belong to a single id. This would be all sessions of a single user in case he is logged in on different browsers / devices.

```javascript

rs.soid({
  app: rsapp,
  id: "bulkuser_999"},
  function(err, resp) {
    /*
    resp contains the sessions:

    { sessions: 
       [ { id: 'bulkuser_999',
           r: 1,
           w: 1,
           ttl: 30,
           idle: 0,
           ip: '127.0.0.2' },
         { id: 'bulkuser_999',
           r: 1,
           w: 1,
           ttl: 7200,
           idle: 0,
           ip: '127.0.0.1' }
        ] 
    }
    */  
  });
```

### Kill all sessions of an id

Kill all sessions of an id within an app:

```javascript

rs.killsoid({app: rsapp, id: 'bulkuser_999'},
  function(err, resp) {
    /*
    resp contains the result:

    {kill: 2} // The amount of sessions that were killed
    */  
  });
```

### Killall

Kill all sessions of an app:

```javascript

rs.killall({app: rsapp},
  function(err, resp) {
    /*
    resp contains the result:

    {kill: 12} // The amount of sessions that were killed
    */  
  });
```

## CHANGELOG

See https://github.com/smrchy/redis-sessions/blob/master/CHANGELOG.md


## More NodeJS and Redis projects?

Check out my projects which are based on NodeJS and Redis as a datastore:

### [RSMQ: Really Simple Message Queue](https://github.com/smrchy/rsmq)

If you run a Redis server and currently use Amazon SQS or a similar message queue you might as well use this fast little replacement. **Using a shared Redis server multiple NodeJS processes can send / receive messages.**

* Lightweight: **Just Redis**. Every client can send and receive messages via a shared Redis server. 
* Guaranteed **delivery of a message to exactly one recipient** within a messages visibility timeout.
* No security: **Like memcached**. Only for internal use in trusted environments.
* Similar to Amazon SQS (with some differences)
* Optional **RESTful interface** via [REST-rsmq](https://github.com/smrchy/rest-rsmq)
* [and more...](https://github.com/smrchy/rsmq)


### [Redis-Tagging](https://github.com/smrchy/redis-tagging)

A NodeJS helper library to make tagging of items in any legacy database (SQL or NoSQL) easy and fast. Redis is used to store tag-item associations and to allow fast queries and paging over large sets of tagged items.

* **Maintains order** of tagged items
* **Unions** and **intersections** while maintaining the order
* Counters for each tag
* **Fast paging** over results with `limit` and `offset`
* Optional **RESTful interface** via [REST-tagging](https://github.com/smrchy/rest-tagging)
* [Read more...](https://github.com/smrchy/redis-tagging)


### [Redis-Sessions](https://github.com/smrchy/redis-sessions)

This is a NodeJS module to keep sessions in a Redis datastore and add some useful methods.

The main purpose of this module is to **generalize sessions across application server platforms**. We use nginx reverse proxy to route parts of a website to a NodeJS server and other parts could be Python, .net, PHP, Coldfusion or Java servers. You can then use [rest-sessions](https://github.com/smrchy/rest-sessions) to access the same sessions on all app server via a REST interface.

* Standard features: Set, update, delete a single session
* Advanced features: List / delete all sessions, all sessions of a single UserID
* Activity in the last *n* seconds
* [and more...](https://github.com/smrchy/redis-sessions)


## The MIT License (MIT)

Copyright © 2013 Patrick Liess, http://www.tcs.de

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
