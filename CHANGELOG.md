# CHANGELOG

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