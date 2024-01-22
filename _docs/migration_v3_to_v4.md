# Migration from v3.0.0 to v4.0.0

 > In v4 support for callbacks was dropped and everything is now promise based.\
 > The functions can be used with `.then()`/`.catch()` or async/await.\
 > Function signatures (except for callbacks) and returns have changed. Instead of empty objects they now return `null` otherwise they are the same.

## Migrate

```javascript
RedisSessions = require("redis-sessions");
rs = new RedisSessions();

rs.create({
	app: "myApp",
	id: "user1001",
	ip: "192.168.22.58",
	ttl: 3600,
	d: { 
		foo: "bar",
		unread_msgs: 34
	}
	},
	function(err, resp) {
		// {token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"}
		// save token somewhere
	});
```

### Usage with async/await

```javascript
import RedisSessions from "redis-sessions"
rs = new RedisSessions<{
  foo: string;
  unread_msg?: number;
  last_action?: "/read/news",
  birthday?: "2013-08-13"
}>();

(async () =>{
	try {
		const resp = await rs.create({
			app: "myApp",
			id: "user1001",
			ip: "192.168.22.58",
			ttl: 3600,
			d: { 
				foo: "bar",
				unread_msgs: 34
			}
		})
		// resp = {token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"}
		// save token somewhere
	} catch (err){
		// catch errors here - e.g. invalid options or redis errors
	}
});
```

### Usage with `.then()`/`.catch()`

```javascript
import RedisSessions from "redis-sessions"
rs = new RedisSessions<{
  foo: string;
  unread_msg?: number;
  last_action?: "/read/news",
  birthday?: "2013-08-13"
}>();

rs.create({
	app: "myApp",
	id: "user1001",
	ip: "192.168.22.58",
	ttl: 3600,
	d: { 
		foo: "bar",
		unread_msgs: 34
	}
})
	.then((resp) => {
		// resp = {token: "r30kKwv3sA6ExrJ9OmLSm4Wo3nt9MQA1yG94wn6ByFbNrVWhcwAyOM7Zhfxqh8fe"}
		// save token somewhere
	})
	.catch((err) => {
		// catch errors here - e.g. invalid options or redis errors
	});
```