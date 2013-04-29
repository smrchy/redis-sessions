# Redis Data Structure


## rs:{app}:{sessionToken} *HASH*

This hash keeps all data for a single session.

**FIELDS** 
* `id`: The unique id field [a-zA-Z0-9_-]
* `r`: Incremental read counter
* `w`: Incremental write counter
* `d`: Data object (contains a JSON object)
* `ip`: Last IP
* `la`: Last activity (unix timestamp)
* `ttl`: Session timeout (set on creation)


## rs:{app}:_sessions *ZSET*

A sorted set of all sessions of a single app

**SCORE** Last activity (unix timestamp)

**MEMBER** The `{sessionToken}:{id}`


## rs:{app}:us:{id} *SET*

A set that contains all session tokens a unique user id has.  
Members will be added on *create* operations and removed on *kill* operations.

**MEMBER** The `{sessionToken}`


## rs:{app}:_users ZSET

A sorted set of all unique users ids of a single app

**SCORE** Last activity (unix timestamp)

**MEMBER** The `{id}`


## rs:SESSIONS *ZSET*

A sorted set of all sessions across all apps. This is used to figure out which sessions need to be flushed.

**SCORE** Kill time (unix timestamp). This is the time after which a session is invalid.
**MEMBER** `{app}:{sessionToken}:{id}` 


