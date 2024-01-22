# Redis Sessions 
[![Redis-Sessions](https://nodei.co/npm/redis-sessions.png?downloads=true&stars=true)](https://nodei.co/npm/redis-sessions/)


This is a Node.js module to keep sessions in a Redis datastore and add some useful methods.

The main purpose of this module is to generalize sessions across application server platforms. We use nginx reverse proxy to route parts of a website to a Node.js server and other parts could be Python, Ruby, .net, PHP, Coldfusion or Java servers. You can then use [rest-sessions](https://github.com/smrchy/rest-sessions) (incompatible with version 4.0.0) to access the same sessions on all app servers via a simple REST interface.

If you use Express check out [Connect-Redis-Sessions](https://www.npmjs.com/package/connect-redis-sessions) (incompatible with version 4.0.0) for a ready to use middleware.

## !!! BREAKING CHANGES VERSION 4.0 !!!

Due to a change from callbacks to async/await, version 4.0.0 is incompatible with version 3.x or lower.  
[Migration-Guide](./_docs/migration_v3_to_v4.md).  

connect-redis-sessions and rest-sessions are both incompatible with version 4.0.0.

## Installation

`npm install redis-sessions`

## Basics

* Every session belongs to an app (e.g. `webapp`, `app_cust123`).
* `create`: A session is created by supplying the app and an id (usually the unique id of the user). A token will be returned.
* `get`: A session is queried with the app and token. This will refresh the `ttl` (timeout) of a session.
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

With Redis running on the same machine as the test script (run via `npm test`) on a 2018 MacBook Pro:

* Creates 1000 sessions in around 140ms.
* Gets those 1000 sessions and validates them in around 90ms.
* Removes those 1000 sessions in 15ms.

## Cache (optional setting)

Modern apps might also use a lot of requests while a user is active. This results in a lot of Redis requests to look up sessions. What's faster than an in-memory cache in Redis? An in-memory cache right in your app! 
When you enable caching you can speed up session lookups by a lot. Consider the following before you enable it:

### How does the cache work

* The reply to the `get()` method will be cached for the time specified in the `cachetime` option.
* Every `set()` or `kill*` method will flush the cache.
* The `idle` and `r` keys that will be returned will not change for cached sessions. 

### What would be a good value for the `cachetime` option?

If your sessions last for 24h and the average user-session is 20m. You might as well set the `cachetime` to around 30m.
Consider the size of your session object that has to be kept in memory. Setting the `cachetime` lower is ok. Because after all it just takes a quick Redis request to fill your cache again.

## Use via REST (This is currently not compatible with the latest version)

See [rest-sessions](https://github.com/smrchy/rest-sessions) (incompatible with version 4.0.0).

## Use in Node.js

### Initialize redis-sessions

```javascript
import RedisSessions from "redis-sessions"
//
// Parameters for RedisSession:
//
// e.g. rs = new RedisSession({host:"192.168.0.20"});
//
// `port`: *optional* Default: `6379`. The Redis port.
// `host`, *optional* Default: `127.0.0.1`. The Redis host.
// `options`, *optional* Default: {}. Additional options. See: https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
// `namespace`: *optional* Default: `rs`. The namespace prefix for all Redis keys used by this module.
// `wipe`: *optional* Default: `600`. The interval in seconds after which expired sessions are wiped. Only values `0` or greater than `10` allowed. Set to `0` to disable.
// `cachemax` (Number) *optional* Default: `5000`. Maximum number of sessions stored in the cache.
rs = new RedisSessions<{
  foo: string;
  unread_msg?: number;
  last_action?: string;
  birthday?: string;
}>();

rsapp = "myapp";
```

### Create a session

Parameters:

* `app` (String) The app id (namespace) for this session.
* `id` (String) The user id of this user. Note: There can be multiple sessions for the same user id. If the user uses multiple client devices.
* `ip` (String) IP address of the user. This is used to show all ips from which the user is logged in.
* `ttl` (Number) *optional* The "Time-To-Live" for the session in seconds. Default: 7200.
* `d` (Object) *optional* Additional data to set for this sessions. (see the "set" method). Default: `{}`
* `no_resave` (Boolean) *optional* If set to `true` the session will not be refreshed on session use. Instead it will run out exactly after the defined `ttl`. Default: `false`

```javascript

// Set a session for `user1001`

const resp = await rs.create({
  app: rsapp,
  id: "user1001",
  ip: "192.168.22.58",
  ttl: 3600,
  d: { 
    foo: "bar",
    unread_msgs: 34
  }
  });
  // resp should be something like 
  // {token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"}

```

Notes:

* You might want to store this token in a cookie / localStorage / sessionStorage.
* If you use Express check out [Connect-Redis-Sessions](https://www.npmjs.com/package/connect-redis-sessions) (Currently incompatible with version 4.0.0).
* As long as the `ttl` isn't reached this token can be used to get the session object for this user.
* Remember that a user (`user1001` in this case) might have other sessions.  
* If you want to limit the number of sessions a user might have you can use the `soid` (sessions of id) method to find other sessions of this user or the `killsoid` (Kill sessions of id) method to kill his other sessions first.

### Update and add some more data to an existing session

```javascript
const resp = await rs.set({
  app: rsapp,
  token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe",
  d: {
    unread_msgs: 12,
    last_action: "/read/news",
    birthday: "2013-08-13"
  }});
  /*
  resp contains the session with the new values:

  {
    "id":"user1001",
    "r": 1,
    "w": 2,
    "idle": 1,
    "ttl": 7200, 
    "d":{
      "foo": "bar",
      "unread_msgs": 12,
      "last_action": "/read/news",
      "birthday": "2013-08-13"
    }
  }
  */
```

Note: The key `foo` that we didn't supply in the `set` command will not be touched. See **Set/Update/Delete** details for details on how to remove keys.

### Get a session for a token

```javascript
const resp= await rs.get({
  app: rsapp,
  token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"});
  /*
  resp contains the session:

  {  
    "id":"user1001",
    "r": 2,  // The number of reads on this token
    "w": 2,  // The number of writes on this token
    "idle": 21,  // The idle time in seconds.
    "ttl": 7200, // Timeout after 7200 seconds idle time
    "d":{
      "foo": "bar",
      "unread_msgs": 12,
      "last_action": "/read/news",
      "birthday": "2013-08-13"
    }
  }

  */
```

### Set/Update/Delete

Set/Update/Delete parameters by supplying app, token and some data `d`.  
The `d` object contains a simple key/value list where values  
can be string, number, boolean or null.  
To remove keys set them to `null`, **keys that are not supplied will not be touched.**  

```javascript

const resp = await rs.set({
  app: rsapp,
  token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe",
  d: {
      "unread_msgs": null
      "last_action": "/read/msg/2121"
  }});
  /*
  resp contains the session with modified values:

  {
    "id":"user1001",
    "r": 2,
    "w": 3,
    "idle": 1,
    "ttl": 7200, 
    "d":{
      "last_action": "/read/msg/2121",
      "birthday": "2013-08-13",
      "foo": "bar"
    }
  }
  */
```

### Kill

Kill a single session by supplying app and token:

```javascript

const resp = await rs.kill({
  app: rsapp,
  token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"});
  /*
  resp contains the result:

  {kill: 1}
  */
```

Note: If `{kill: 0}` is returned the session was not found.


### Activity

Query the amount of active session within the last 10 minutes (600 seconds).
Note: Multiple sessions from the same user id will be counted as one.

```javascript

const resp = await rs.activity({
  app: rsapp,
  deltaTime: 600
  });
  /*
  resp contains the activity:

  {activity: 12}
  */
```

### Sessions of App

Get all sessions of an app there were active within the last 10 minutes (600 seconds).

```javascript

const resp = await rs.soapp({
  app: rsapp,
  deltaTime: 600
  });
  /*
  resp contains the sessions:

  {
    sessions: [
      {
        id: 'someuser123',
        r: 1,
        w: 1,
        ttl: 30,
        idle: 0,
        ip: '127.0.0.2'
      },
      {
        id: 'anotheruser456',
        r: 4,
        w: 2,
        ttl: 7200,
        idle: 24,
        ip: '127.0.0.1'
      }
    ]
  }
  */
```

### Sessions of Id

Get all sessions within an app that belong to a single id. This would be all sessions of a single user in case he is logged in on different browsers / devices.

```javascript

const resp = await rs.soid({
  app: rsapp,
  id: "bulkuser_999"
  });
  /*
  resp contains the sessions:

  {
    sessions: [
      {
        id: 'bulkuser_999',
        r: 1,
        w: 1,
        ttl: 30,
        idle: 0,
        ip: '127.0.0.2'
      },
      {
        id: 'bulkuser_999',
        r: 1,
        w: 1,
        ttl: 7200,
        idle: 0,
        ip: '127.0.0.1'
      }
    ]
  }
  */
```

### Kill all sessions of an id

Kill all sessions of an id within an app:

```javascript

const resp = rs.killsoid({app: rsapp, id: 'bulkuser_999'});
  /*
  resp contains the result:

  {kill: 2} // The amount of sessions that were killed
  */
```

### Killall

Kill all sessions of an app:

```javascript

const resp = await rs.killall({app: rsapp});
  /*
  resp contains the result:

  {kill: 12} // The amount of sessions that were killed
  */
```

### Ping

Ping the redis server

```javascript

const resp = await rs.ping();
  /*
  resp contains the result:

  "PONG"
  */
```

## Tests

Before running Test you need to build the js files (npm run build) and have a redis server running.

## Typescript Pitfalls !!!

* If you do not specify a d object in `create` and only partially set it using the `set` function, be aware that `get` may return a session with a defined d object that is missing properties of the supplied type.
* The `set` function only lets you delete optional keys.
* If you use an Record<string,...> as the Generic Type you wont be able to delete properties with the `set` function. If you don`t have an more defined data type use the any type and cast your returned objects.
* If you define your type as an empty object or only have optional parameters giving an empty object for d will still trow an error at runtime.

## CHANGELOG

See [CHANGELOG.md](https://github.com/smrchy/redis-sessions/blob/master/CHANGELOG.md)


## More Node.js and Redis projects?

Check out my projects which are based on Node.js and Redis as a datastore:

### [RSMQ: Really Simple Message Queue](https://github.com/smrchy/rsmq)

If you run a Redis server and currently use Amazon SQS or a similar message queue you might as well use this fast little replacement. **Using a shared Redis server multiple Node.js processes can send / receive messages.**

* Lightweight: **Just Redis**. Every client can send and receive messages via a shared Redis server. 
* Guaranteed **delivery of a message to exactly one recipient** within a messages visibility timeout.
* No security: **Like memcached**. Only for internal use in trusted environments.
* Similar to Amazon SQS (with some differences)
* Optional **RESTful interface** via [REST-rsmq](https://github.com/smrchy/rest-rsmq)
* [and more...](https://github.com/smrchy/rsmq)


### [Redis-Tagging](https://github.com/smrchy/redis-tagging)

A Node.js helper library to make tagging of items in any legacy database (SQL or NoSQL) easy and fast. Redis is used to store tag-item associations and to allow fast queries and paging over large sets of tagged items.

* **Maintains order** of tagged items
* **Unions** and **intersections** while maintaining the order
* Counters for each tag
* **Fast paging** over results with `limit` and `offset`
* Optional **RESTful interface** via [REST-tagging](https://github.com/smrchy/rest-tagging)
* [Read more...](https://github.com/smrchy/redis-tagging)

## The MIT License (MIT)

Copyright © 2013 Patrick Liess, http://www.tcs.de

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
