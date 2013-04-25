# Redis Sessions

[![Build Status](https://secure.travis-ci.org/smrchy/redis-sessions.png?branch=master)](http://travis-ci.org/smrchy/redis-sessions)

There is a need to maintain a **universal session across different application server platforms**.

This is a NodeJS module to keep sessions in a Redis datastore and add some useful methods.

## Installation

`npm install redis-sessions`

## Basics

* Every session belongs to an app (e.g. `webapp`, `app_cust123`).
* A session is created by supplying the app and an id (usually the unique id of the user). A token will be returned.
* A session is queried with the app and token.
* Additional data (key/value) can be stored in the session.
* A session can be killed with the app and token.
* All sessions of an app can be killed.

## Additional methods

* TODO: Get an array of all sessions of an app, complete with `lastactivity`, `ip` which were active within the last *n* seconds.
* Get the amount of active sessions of an app within the last *n* seconds.
* TODO: Get all sessions of a single id.
* TODO: Kill all sessions that belong to a single id. E.g. log out user123 on all devices.

## Usage in NodeJS

### Setup and creating the first session

```javascript
RedisSessions = require("../redis-sessions");
rs = new RedisSessions();

app = "myapp";

// Set a session for `user1001`

rs.create({
  app: app,
  id: "user1001"},
  function(err, resp) {
    // resp should be something like 
   // {token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"}
  });
```

### Add some data to the session

```javascript
rs.set({
  app: app,
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
          "unread_msgs": 12,
          "last_action": "/read/news",
          "birthday": "2013-08-13"
        }
    }
    */  
  });
``


### Get a session for a token

```javascript
rs.get({
  app: app,
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
  app: app,
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
          "birthday": "2013-08-13"
        }
    }
    */  
  });
```

