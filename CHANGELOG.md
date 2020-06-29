# CHANGELOG

## 3.0.0

* Dropped suppoer for Node 4 and Node 6
* Added test support for Node 12
* Updated all dependencies
* Added LICENSE.md file

## 2.1.0

* Feature: New `cachetime` option to cache the responses for `get()`. (Issue #38) 
* Updated docs and tests

## 2.0.3

* Removed `hiredis` from optional dependencies for better Node 10 compatibility.
* Issue #35 Clear wipe interval on quit()

## 2.0.2

* Updated lodash to ^4.17.11

## 2.0.0

* Added the optional `no_resave` parameter for the `create` method. (see docs)
* Updated dependencies, Cleaned up code.
* Added higher timeouts for mocha tests to test the `no_resave` functionality.
* Added Travis tests for Node 10

## 1.3.0

* Issue #33 Allow up to 128 charactes (from 64) and all UTF-8 characters as `id`. This lets you store for example emails as id.
* Travis tests for Node 8 added.

## 1.2.0

* Allow options.url with Redis options object. #31 Thanks to @cristiangraz

## 1.1.0

* Travis tests for Node 4 and 6. Should fix Travis build errors.
* Added `ping` method.

## 1.0.6

* Removed callback for `quit` method.

## 1.0.5

* Added `quit` method for use with AWS Lambda

## 1.0.4 

* Upped Redis dependencies

## 1.0.3

* Fixed typo

## 1.0.2

* Fixed possible memory leak in wipe functions

## 1.0.1

* Modified docs to make it clear that TTL is specified in seconds
* Introduced `wipe: 0` in options to disable wiping of expired sessions

## 1.0.0

* Use lodash 4.0.0

## 0.5.3

* Travis tests for Node 4.2 LTS

## 0.5.2

* Remove Travis tests for iojs. Added Travis tests for Node 5.0

## 0.5.1

* Remove Travis tests for Node 0.8.0

## 0.5.0

* Added Travis tests for Node 4.0

## 0.3.9

* Fixed #14 - Typo in README.md example. Thanks @odirus and @codeName007

## 0.3.8

* Removed debug message when wiping timed out sessions.

## 0.3.7 

* Switched from underscore to lodash

## 0.3.6

* Allow `d` parameter on create.
* Updated docs.
* Added tests for `d` on create feature.

## 0.3.3

 * Redis connection events

## 0.3.2

* Make `hiredis` optional. #5

## 0.3.1

* Added support for [https://github.com/mranney/node_redis#rediscreateclientport-host-options](redis.createClient) `options` object.
* Added docs for `client` option to supply an already connected Redis object to **redis-sessions**