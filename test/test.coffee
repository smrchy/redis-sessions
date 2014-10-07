_ = require "lodash"
should = require "should"
async = require "async"
RedisSessions = require "../index" 

describe 'Redis-Sessions Test', ->
	rs = null
	app1 = "test"
	app2 = "TEST"

	token1 = null
	token2 = null
	token3 = null
	token4 = null
	bulksessions = []


	before (done) ->
		done()
		return

	after (done) ->
		done()		
		return
	

	it 'get a RedisSessions instance', (done) ->
		rs = new RedisSessions()
		rs.should.be.an.instanceOf RedisSessions
		done()
		return

	describe 'GET: Part 1', ->
		it 'Get a Session with invalid app format: no app supplied', (done) ->
			rs.get {}, (err, resp) ->
				err.message.should.equal("No app supplied")
				done()
				return
			return

		it 'Get a Session with invalid app format: too short', (done) ->
			rs.get {app: "a"}, (err, resp) ->
				err.message.should.equal("Invalid app format")
				done()
				return
			return

		it 'Get a Session with invalid token format: no token at all', (done) ->
			rs.get {app: app1}, (err, resp) ->
				err.message.should.equal("No token supplied")
				done()
				return
			return

		it 'Get a Session with invalid token format: token shorter than 64 chars', (done) ->
			rs.get {app: app1, token: "lsdkjfslkfjsldfkj"}, (err, resp) ->
				err.message.should.equal("Invalid token format")
				done()
				return
			return

		it 'Get a Session with invalid token format: token longer than 64 chars', (done) ->
			rs.get {app: app1, token: "0123456789012345678901234567890123456789012345678901234567890123456789"}, (err, resp) ->
				err.message.should.equal("Invalid token format")
				done()
				return
			return

		it 'Get a Session with invalid token format: token with invalid character', (done) ->
			rs.get {app: app1, token: "!123456789012345678901234567890123456789012345678901234567891234"}, (err, resp) ->
				err.message.should.equal("Invalid token format")
				done()
				return
			return
		
		it 'Get a Session with valid token format but token should not exist', (done) ->
			rs.get {app: app1, token: "0123456789012345678901234567890123456789012345678901234567891234"}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.not.have.keys('id')
				done()
				return
			return
		
		return

	describe 'CREATE: Part 1', ->
		it 'Create a session with invalid data: no app supplied', (done) ->
			rs.create {}, (err, resp) ->
				err.message.should.equal("No app supplied")
				done()
				return
			return
		
		it 'Create a session with invalid data: no id supplied', (done) ->
			rs.create {app: app1}, (err, resp) ->
				err.message.should.equal("No id supplied")
				done()
				return
			return
		
		it 'Create a session with invalid data: no ip supplied', (done) ->
			rs.create {app: app1, id:"user1"}, (err, resp) ->
				err.message.should.equal("No ip supplied")
				done()
				return
			return
		
		it 'Create a session with invalid data: ttl too short', (done) ->
			rs.create {app: app1, id:"user1", ip: "127.0.0.1", ttl: 4}, (err, resp) ->
				err.message.should.equal("ttl must be a positive integer >= 10")
				done()
				return
			return
		
		it 'Create a session with valid data: should return a token', (done) ->
			rs.create {app: app1, id:"user1", ip: "127.0.0.1", ttl: 30}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('token')
				token1 = resp.token
				done()
				return
			return
		
		it 'Activity should show 1 user', (done) ->
			rs.activity {app: app1, dt: 60}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('activity')
				resp.activity.should.equal(1)
				done()
				return
			return

		it 'Create another session for user1: should return a token', (done) ->
			rs.create {app: app1, id:"user1", ip: "127.0.0.2", ttl: 30}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('token')
				done()
				return
			return

		it 'Create yet another session for user1 with a `d` object: should return a token', (done) ->
			rs.create {app: app1, id:"user1", ip: "127.0.0.2", ttl: 30, d:{"foo":"bar","nu":null,"hi":123,"lo":-123,"boo":true,"boo2":false}}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('token')
				token4 = resp.token
				done()
				return
			return

		it 'Create yet another session for user1 with an invalid `d` object: should return a token', (done) ->
			rs.create {app: app1, id:"user1", ip: "127.0.0.2", ttl: 30, d:{"inv":[]}}, (err, resp) ->
				should.not.exist(resp)
				should.exist(err)
				done()
				return
			return

		it 'Create yet another session for user1 with an invalid `d` object: should return a token', (done) ->
			rs.create {app: app1, id:"user1", ip: "127.0.0.2", ttl: 30, d:{}}, (err, resp) ->
				should.not.exist(resp)
				should.exist(err)
				done()
				return
			return

		it 'Activity should STILL show 1 user', (done) ->
			rs.activity {app: app1, dt: 60}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('activity')
				resp.activity.should.equal(1)
				done()
				return
			return
		
		it 'Create another session with valid data: should return a token', (done) ->
			rs.create {app: app1, id:"user2", ip: "127.0.0.1", ttl: 10}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('token')
				token2 = resp.token
				done()
				return
			return
		
		it 'Activity should show 2 users', (done) ->
			rs.activity {app: app1, dt: 60}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('activity')
				resp.activity.should.equal(2)
				done()
				return
			return

		it 'Sessions of App should return 4 users', (done) ->
			rs.soapp {app: app1, dt: 60}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('sessions')
				resp.sessions.length.should.equal(4)
				done()
				return
			return

		
		it 'Create a session for another app with valid data: should return a token', (done) ->
			rs.create {app: app2, id:"user1", ip: "127.0.0.1", ttl: 30}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('token')
				token3 = resp.token
				done()
				return
			return
		
		it 'Activity should show 1 user', (done) ->
			rs.activity {app: app2, dt: 60}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('activity')
				resp.activity.should.equal(1)
				done()
				return
			return

		it 'Create 1000 sessions for app2: succeed', (done) ->
			pq = []
			for i in [0...1000]
				pq.push({app:app2, id: "bulkuser_" + i, ip:"127.0.0.1"})
			async.map pq, rs.create, (err, resp) ->
				for e in resp
					e.should.have.keys('token')
					bulksessions.push(e.token)
					e.token.length.should.equal(64)
				done()
				return
			return
		
		it 'Activity should show 1001 user', (done) ->
			rs.activity {app: app2, dt: 60}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('activity')
				resp.activity.should.equal(1001)
				done()
				return
			return

		it 'Get 1000 sessions for app2: succeed', (done) ->
			pq = []
			for e,i in bulksessions
				pq.push({app:app2, token: e})
			async.map pq, rs.get, (err, resp) ->
				resp.length.should.equal(1000)
				for e,i in resp
					e.should.have.keys('id','r','w','ttl','idle','ip')
					e.id.should.equal("bulkuser_" + i)
				done()
				return
			return

		it 'Create a session for bulkuser_999 with valid data: should return a token', (done) ->
			rs.create {app: app2, id:"bulkuser_999", ip: "127.0.0.2", ttl: 30}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('token')
				done()
				return
			return

		it 'Check if we have 2 sessions for bulkuser_999', (done) ->
			rs.soid {app: app2, id: "bulkuser_999"}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('sessions')
				resp.sessions.length.should.equal(2)
				resp.sessions[0].id.should.equal("bulkuser_999")
				done()
				return
			return

		it 'Remove those 2 sessions for bulkuser_999', (done) ->
			rs.killsoid {app: app2, id: "bulkuser_999"}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('kill')
				resp.kill.should.equal(2)
				done()
				return
			return

		it 'Check if we have still have sessions for bulkuser_999: should return 0', (done) ->
			rs.soid {app: app2, id: "bulkuser_999"}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('sessions')
				resp.sessions.length.should.equal(0)
				done()
				return
			return
		return




	describe 'GET: Part 2', ->
		it 'Get the Session for token1: should work', ( done ) ->
			rs.get {app: app1, token: token1}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.have.keys('id','r','w','ttl','idle','ip')
				resp.id.should.equal("user1")
				resp.ttl.should.equal(30)
				done()
				return
			return

		it 'Get the Session for token1 again: should work', ( done ) ->
			rs.get {app: app1, token: token1}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.have.keys('id','r','w','ttl','idle','ip')
				resp.id.should.equal("user1")
				resp.ttl.should.equal(30)
				resp.r.should.equal(2)
				done()
				return
			return


		it 'Sessions of App should return 4 users', (done) ->
			rs.soapp {app: app1, dt: 60}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('sessions')
				resp.sessions.length.should.equal(4)
				done()
				return
			return

		it 'Kill the Session for token1: should work', ( done ) ->
			rs.kill {app: app1, token: token1}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.have.keys('kill')
				resp.kill.should.equal(1)
				done()
				return
			return

		it 'Get the Session for token1: should fail', ( done ) ->
			rs.get {app: app1, token: token1}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.not.have.keys('id')
				done()
				return
			return

		it 'Activity for app1 should show 2 users still', (done) ->
			rs.activity {app: app1, dt: 60}, (err, resp) ->
				should.not.exist(err)
				should.exist(resp)
				resp.should.have.keys('activity')
				resp.activity.should.equal(2)
				done()
				return
			return


		it 'Get the Session for token2', ( done ) ->
			rs.get {app: app1, token: token2}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.have.keys('id','r','w','ttl','idle','ip')
				resp.id.should.equal("user2")
				resp.ttl.should.equal(10)
				done()
				return
			return
		it 'Get the Session for token4', ( done ) ->
			rs.get {app: app1, token: token4}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.have.keys('id','r','w','ttl','idle','ip','d')
				resp.id.should.equal("user1")
				resp.ttl.should.equal(30)
				resp.d.foo.should.equal("bar")
				done()
				return
			return
		return
	describe 'SET', ->
		it 'Set some params for token1 with no d: should fail', ( done ) ->
			rs.set {app: app1, token: token1}, (err, resp) ->
				err.message.should.equal("No d supplied")
				done()
				return
			return
		it 'Set some params for token1 with d being an array', ( done ) ->
			rs.set {app: app1, token: token1, d:[12,"bla"]}, (err, resp) ->
				err.message.should.equal("d must be an object")
				done()
				return
			return
		it 'Set some params for token1 with d being a string: should fail', ( done ) ->
			rs.set {app: app1, token: token1, d:"someString"}, (err, resp) ->
				err.message.should.equal("d must be an object")
				done()
				return
			return
		it 'Set some params for token1 with forbidden type (array): should fail', ( done ) ->
			rs.set {app: app1, token: token1, d:{arr:[1,2,3]}}, (err, resp) ->
				err.message.should.equal("d.arr has a forbidden type. Only strings, numbers, boolean and null are allowed.")
				done()
				return
			return
		it 'Set some params for token1 with forbidden type (object): should fail', ( done ) ->
			rs.set {app: app1, token: token1, d:{obj:{bla:1}}}, (err, resp) ->
				err.message.should.equal("d.obj has a forbidden type. Only strings, numbers, boolean and null are allowed.")
				done()
				return
			return
		it 'Set some params for token1 with an empty object: should fail', ( done ) ->
			rs.set {app: app1, token: token1, d:{}}, (err, resp) ->
				err.message.should.equal("d must containt at least one key.")
				done()
				return
			return
		it 'Set some params for token1: should fail as token1 was killed', ( done ) ->
			rs.set {app: app1, token: token1, d:{str:"haha"}}, (err, resp) ->
				should.not.exist(err)
				resp.should.not.have.keys('id')
				done()
				return
			return
		it 'Set some params for token2: should work', ( done ) ->
			rs.set {app: app1, token: token2, d: {hi: "ho", count: 120, premium: true, nix:null }}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				done()
				return
			return
		it 'Get the session for token2: should work and contain new values', (done) ->
			rs.get {app: app1, token: token2}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.d.should.have.keys('hi','count','premium')
				done()
				return
			return
		it 'Remove a param from token2: should work', ( done ) ->
			rs.set {app: app1, token: token2, d: {hi: null}}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.d.should.have.keys('count','premium')
				done()
				return
			return
		it 'Get the session for token2: should work and contain modified values', (done) ->
			rs.get {app: app1, token: token2}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.d.should.have.keys('count','premium')
				done()
				return
			return

		it 'Remove all remaining params from token2: should work', ( done ) ->
			rs.set {app: app1, token: token2, d: {count: null, premium: null}}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.not.have.keys('d')
				done()
				return
			return
		it 'Get the session for token2: should work and not contain the d key', (done) ->
			rs.get {app: app1, token: token2}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.not.have.keys('d')
				done()
				return
			return
		it 'Remove all remaining params from token2 again: should work', ( done ) ->
			rs.set {app: app1, token: token2, d: {count: null, premium: null}}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.not.have.keys('d')
				done()
				return
			return
		it 'Get the session for token2: should work and not contain the d key', (done) ->
			rs.get {app: app1, token: token2}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.should.not.have.keys('d')
				done()
				return
			return
		
		it 'Set some params for token2: should work', ( done ) ->
			rs.set {app: app1, token: token2, d: {a: "sometext", b: 20, c: true, d: false}}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.d.should.have.keys('a','b','c','d')
				resp.d.a.should.equal("sometext")
				resp.d.b.should.equal(20)
				resp.d.c.should.equal(true)
				resp.d.d.should.equal(false)
				done()
				return
			return

		it 'Modify some params for token2: should work', ( done ) ->
			rs.set {app: app1, token: token2, d: {a: false, b: "some_text", c: 20, d: true, e:20.212}}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.d.should.have.keys('a','b','c','d','e')
				resp.d.a.should.equal(false)
				resp.d.b.should.equal('some_text')
				resp.d.c.should.equal(20)
				resp.d.d.should.equal(true)
				resp.d.e.should.equal(20.212)
				done()
				return
			return
		it 'Get the params for token2: should work', ( done ) ->
			rs.get {app: app1, token: token2}, (err, resp) ->
				should.not.exist(err)
				resp.should.be.an.Object
				resp.d.should.have.keys('a','b','c','d','e')
				resp.d.a.should.equal(false)
				resp.d.b.should.equal('some_text')
				resp.d.c.should.equal(20)
				resp.d.d.should.equal(true)
				resp.d.e.should.equal(20.212)
				done()
				return
			return

		return
	describe 'CLEANUP', ->
		# Kill all tokens
		it 'Remove all sessions from app1', (done) ->
			rs.killall {app:app1}, (err, resp) ->
				should.exist(resp.kill)
				done()
				return
			return

		it 'Remove all sessions from app2', (done) ->
			rs.killall {app:app2}, (err, resp) ->
				should.exist(resp.kill)
				done()
				return
			return
		return
	
	return