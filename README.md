# Redis Universal Sessions

There is a need to maintain a **universal session across different application server platforms**.

**It should be simple and straightforward to query a session and set session variables.**

Features:

* Every session belongs to an app (e.g. `webapp`, `app_cust123`)
  * TODO: Get an array of all sessions of an app, complete with `lastactivity`, `ip` which were active within the last *n* seconds.
  * Get the amount of active sessions of an app within the last *n* seconds.
  * Kill all sessions of an app.

* Every session **must have** an unique id, which is usually the userid of the logged in user.
  * TODO: Get all sessions of a single id.
  * Kill all sessions that belong to a single id. E.g. log out user123 on all devices.

* Basic stuff
  * Create a session by supplying an id and a timeout in seconds. Will return the session token:  
  e.g. `d131dd02c5e6eec4d131c69821bcb6a88393dd02c5e6eec4d131dd02c5e6eec4`
  * Kill a session by supplying the session token.
  * Query a session by supplying the session token.  
    The `idle` time is the duration in seconds since when this session was used before this request.
    Will return the complete object:  
  	
  		{  
  			"id":"user123",
  			"r": 123,  // The number of reads on this token
  			"w": 4,  // The number of writes on this token
        "idle": 21,  // The idle time in seconds.
  			"d":
  				{
  					"unread_msgs": "12",
  					"last_action": "/read/news",
  					"birthday": "2013-08-13"
  				}
  		}
 
  * Set/Update/Delete parameters by supplying a token and some data.  
  The `data` object contains a simple key/value list where values are **always** strings.  
  To remove keys set them to `null`, keys that are not supplied will not be touched:  
  
  		{
  			"token": "d131dd02c5e6eec4d131c69821bcb6a88393dd02c5e6eec4d131dd02c5e6eec4",
  			"d":
  				{
  					"unread_msgs": null,
  					"last_action": "/read/msg/2121"
  				}
  		}
  		
   * After the above operation  
   the resulting object will look like this:    
   
   		{
   			"id":"user123",
   			"r": 124,
   			"w": 5,
        "idle": 1,
   			"data": {
   				"last_action": "/read/msg/2121",
   				"birthday": "2013-08-13"
   			}
   		}
   