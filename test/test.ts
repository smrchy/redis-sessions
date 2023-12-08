import _ from "lodash";
import RedisSessions from "../index";
import type { Session } from "../index";
import should from "should";

const tokenReg = /^([\dA-Za-z]){64}$/;
const testToken = "NIxwHyNScshj9B5g95OcrzETD9D4KayzcOnAbgiB7Cv7PxJRlK4miIAeZlpwgc6p2";

function test() {
	// const rs = new RedisSessions({});
	// const pong = await rs.ping();
	// console.log(pong);
	const testZeit = Date.now().toString(36);
	console.log(testToken.length);
	console.log(testZeit.length, testZeit);
}



describe("Redis-Sessions Test", function () {
	let rs: RedisSessions;
	let rswithcache;
	const app1 = "test";
	const app2 = "TEST";
	let token1 = "";
	let token2 = "";
	let token3 = "";
	let token4 = "";
	let token5 = "";
	const bulksessions: string[] = [];
	before(function (done) {
		done();
	});
	after(function (done) {
		done();
		// eslint-disable-next-line unicorn/no-process-exit
		process.exit(0);
	});

	it("get a RedisSessions instance", function (done) {
		rs = new RedisSessions({
			cachetime: 0
		});
		rs.should.be.an.instanceOf(RedisSessions);
		done();
	});
	describe("GET: Part 1", function () {
		it("Ping the redis server", async function () {
			const resp = await rs.ping();
			resp.should.equal("PONG");
		});
		it("Get a Session with invalid app format: no app supplied", async function () {
			try {
				// @ts-expect-error testing purposes
				await rs.get({});
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("No app supplied");
			}
		});
		it("Get a Session with invalid app format: too short", async function () {
			try {
				// @ts-expect-error testing purposes
				await rs.get({ app: "a" });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("Invalid app format");
			}
		});
		it("Get a Session with invalid token format: no token at all", async function () {
			try {
				// @ts-expect-error testing purposes
				await rs.get({ app: app1 });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("No token supplied");
			}
		});
		it("Get a Session with invalid token format: token shorter than 64 chars", async function () {
			try {
				await rs.get({ app: app1, token: "lsdkjfslkfjsldfkj" });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("Invalid token format");
			}
		});
		it("Get a Session with invalid token format: token longer than 64 chars", async function () {
			try {
				await rs.get({ app: app1, token: "0123456789012345678901234567890123456789012345678901234567890123456789" });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("Invalid token format");
			}
		});
		it("Get a Session with invalid token format: token with invalid character", async function () {
			try {
				await rs.get({ app: app1, token: "!123456789012345678901234567890123456789012345678901234567891234" });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("Invalid token format");
			}
		});
		it("Get a Session with valid token format but token should not exist", async function () {

			const response = await rs.get({
				app: app1,
				token: "0123456789012345678901234567890123456789012345678901234567891234"
			});
			should.equal(response, null);
		});
	});

	describe("CREATE: Part 1", function () {
		it("Create a session with invalid data: no app supplied", async function () {
			try {
				// @ts-expect-error testing purposes
				await rs.create({});
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("No app supplied");
			}
		});
		it("Create a session with invalid data: no id supplied", async function () {
			try {
				// @ts-expect-error testing purposes
				await rs.create({ app: app1 });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("No id supplied");
			}
		});
		it("Create a session with invalid data: no ip supplied", async function () {
			try {
				// @ts-expect-error testing purposes
				await rs.create({ app: app1, id: "user1" });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("No ip supplied");
			}
		});
		it("Create a session with invalid data: Longer than 39 chars ip supplied", async function () {
			try {
				await rs.create({ app: app1, id: "user1", ip: "1234567890123456789012345678901234567890" });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("Invalid ip format");
			}
		});
		it("Create a session with invalid data: zero length ip supplied", async function () {
			try {
				await rs.create({ app: app1, id: "user1", ip: "" });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("No ip supplied");
			}
		});
		it("Create a session with invalid data: ttl too short", async function () {
			try {
				await rs.create({ app: app1, id: "user1", ip: "127.0.0.1", ttl: 4 });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("ttl must be a positive integer >= 10");
			}
		});
		it("Create a session with valid data: should return a token", async function () {
			const resp = await rs.create({ app: app1, id: "user1", ip: "127.0.0.1", ttl: 30 });
			resp.should.have.keys("token");
			token1 = resp.token;
		});
		it("Activity should show 1 user", async function () {
			const resp = await rs.activity({ app: app1, dt: 60 });
			resp.should.have.keys("activity");
			resp.activity.should.equal(1);
		});
		it("Create another session for user1: should return a token", async function () {
			const resp = await rs.create({ app: app1, id: "user1", ip: "127.0.0.2", ttl: 30 });
			resp.should.have.keys("token");
		});
		it("Create yet another session for user1 with a `d` object: should return a token", async function () {
			const resp = await rs.create({
				app: app1, id: "user1", ip: "127.0.0.2", ttl: 30, d: {
					"foo": "bar", "nu": null, "hi": 123, "lo": -123, "boo": true, "boo2": false
				}
			});
			resp.should.have.keys("token");
			token4 = resp.token;
		});
		// patric fragen ob error
		it("Create yet another session for user1 with an invalid `d` object: should throw error", async function () {
			try {
				await rs.create({
					// @ts-expect-error testing purposes
					app: app1, id: "user1", ip: "2001:0000:1234:0000:0000:C1C0:ABCD:0876", ttl: 30, d: { inv: [] }
				});
			} catch (error) {
				should.exist(error);
			}
		});
		// error
		it("Create yet another session for user1 with an invalid `d` object: should throw error", async function () {
			try {
				await rs.create({
					app: app1, id: "user1", ip: "2001:0000:1234:0000:0000:C1C0:ABCD:0876", ttl: 30, d: {}
				});
			} catch (error) {
				should.exist(error);
			}
		});
		it("Activity should STILL show 1 user", async function () {
			const resp = await rs.activity({ app: app1, dt: 60 });
			resp.should.have.keys("activity");
			resp.activity.should.equal(1);
		});
		it("Create another session with valid data: should return a token", async function () {
			const resp = await rs.create({ app: app1, id: "user2", ip: "127.0.0.1", ttl: 10 });
			resp.should.have.keys("token");
			token2 = resp.token;
		});
		it("Activity should show 2 users", async function () {
			const resp = await rs.activity({ app: app1, dt: 60 });
			resp.should.have.keys("activity");
			resp.activity.should.equal(2);
		});
		it("Sessions of App should return 4 users", async function () {
			const resp = await rs.soapp({ app: app1, dt: 60 });
			resp.should.have.keys("sessions");
			resp.sessions.length.should.equal(4);
		});
		it("Create a session with `no_resave`", async function () {
			const resp = await rs.create({
				app: app1, id: "user5noresave", ip: "127.0.0.1", ttl: 10, no_resave: true
			});
			resp.should.have.keys("token");
			token5 = resp.token;
		});
		it("Wait 6s", function (done) {
			setTimeout(done, 6000);
		});
		it("Create a session for another app with valid data: should return a token", async function () {
			const resp = await rs.create({
				app: app2, id: "user1", ip: "127.0.0.1", ttl: 30
			});
			resp.should.have.keys("token");
			token3 = resp.token;
		});
		it("Activity should show 1 user", async function () {
			const resp = await rs.activity({ app: app2, dt: 60 });
			resp.should.have.keys("activity");
			resp.activity.should.equal(1);
		});

		it("Create 1000 sessions for app2: succeed", async function () {
			const pq = [];
			for (let i = 0; i < 1000; i++) {
				pq.push({
					app: app2,
					id: "bulkuser_" + i,
					ip: "127.0.0.1"
				});
			}
			for (const user of pq) {
				const resp = await rs.create(user);
				resp.should.have.keys("token");
				bulksessions.push(resp.token);
			}
		});
		it("Activity should show 1001 user", async function () {
			const resp = await rs.activity({ app: app2, dt: 60 });
			resp.should.have.keys("activity");
			resp.activity.should.equal(1001);
		});
		it("Get 1000 sessions for app2: succeed", async function () {
			const pq = [];
			for (const bulksession of bulksessions) {
				pq.push({
					app: app2,
					token: bulksession
				});
			}
			const response = [];
			for (const [j, element] of pq.entries()) {
				const resp = await rs.get(element);
				should.notEqual(resp, null);
				if (resp !== null) {
					resp.should.have.keys("id", "r", "w", "ttl", "idle", "ip");
					resp.id.should.equal("bulkuser_" + j);
				}
				response.push(resp);
			}
			response.length.should.equal(1000);
		});

		it("Create a session for bulkuser_999 with valid data: should return a token", async function () {
			const resp = await rs.create({ app: app2, id: "bulkuser_999", ip: "127.0.0.2", ttl: 30 });
			resp.should.have.keys("token");
		});
		it("Check if we have 2 sessions for bulkuser_999", async function () {
			const resp = await rs.soid({ app: app2, id: "bulkuser_999" });
			resp.should.have.keys("sessions");
			resp.sessions.length.should.equal(2);
			resp.sessions[0].id.should.equal("bulkuser_999");
		});
		it("Remove those 2 sessions for bulkuser_999", async function () {
			const resp = await rs.killsoid({ app: app2, id: "bulkuser_999" });
			resp.should.have.keys("kill");
			resp.kill.should.equal(2);
		});
		it("Check if we have still have sessions for bulkuser_999: should return 0", async function () {
			const resp = await rs.killsoid({ app: app2, id: "bulkuser_999" });
			resp.should.have.keys("kill");
			resp.kill.should.equal(0);
		});
		it("Create a session with utf8 (딸기 필드 영원히) chars for the id: should return a token", async function () {
			const resp = await rs.create({ app: app1, id: "딸기 필드 영원히", ip: "127.0.0.1", ttl: 30 });
			const response = await rs.get({ app: app1, token: resp.token });
			should.notEqual(response, null);
			if (response !== null) {
				response.id.should.equal("딸기 필드 영원히");
			}
		});
		it("Create a session with email for the id: should return a token", async function () {
			const resp = await rs.create({ app: app1, id: "abcde1-284h1ah37@someDomain-with-dash.co.uk", ip: "127.0.0.1", ttl: 30 });
			const response = await rs.get({ app: app1, token: resp.token });
			should.notEqual(response, null);
			if (response !== null) {
				response.id.should.equal("abcde1-284h1ah37@someDomain-with-dash.co.uk");
			}
		});
	});

	describe("GET: Part 2", function () {
		it("Get the Session for token1: should work", async function () {
			const resp = await rs.get({
				app: app1,
				token: token1
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.should.have.keys("id", "r", "w", "ttl", "idle", "ip");
				resp.id.should.equal("user1");
				resp.ttl.should.equal(30);
			}
		});
		it("Get the Session for token1 again: should work", async function () {
			const resp = await rs.get({
				app: app1,
				token: token1
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.should.have.keys("id", "r", "w", "ttl", "idle", "ip");
				resp.id.should.equal("user1");
				resp.ttl.should.equal(30);
				resp.r.should.equal(2);
			}
		});
		it("Get the Session for token5: should nave `no_resave` parameter set.", async function () {
			const resp = await rs.get({
				app: app1,
				token: token5
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.should.have.keys("id", "r", "w", "ttl", "idle", "ip", "no_resave");
				resp.id.should.equal("user5noresave");
				resp.ttl.should.be.below(5);
				resp.idle.should.be.above(4);
				resp.r.should.equal(1);
				should.equal(resp.no_resave, true);
			}
		});
		it("Wait 6s", function (done) {
			setTimeout(done, 6000);
		});
		it("Get the Session for token2: Should be gone", async function () {
			const resp = await rs.get({
				app: app1,
				token: token2
			});
			should.equal(resp, null);
		});
		it("Get the Session for token5: should no longer be there", async function () {
			const resp = await rs.get({
				app: app1,
				token: token5
			});
			should.equal(resp, null);
		});
		it("Sessions of App should return 5 users", async function () {
			const resp = await rs.soapp({ app: app1, dt: 60 });
			should.notEqual(resp, null);
			resp.should.have.keys("sessions");
			resp.sessions.length.should.equal(5);
		});
		it("Kill the Session for token1: should work", async function () {
			const resp = await rs.kill({ app: app1, token: token1 });
			resp.should.be.an.Object();
			resp.should.have.keys("kill");
			should.equal(resp.kill, 1);
		});
		it("Get the Session for token1: should fail", async function () {
			const resp = await rs.get({ app: app1, token: token1 });
			should.equal(resp, null);
		});
		// 5 users still
		it("Activity for app1 should show 4 users still", async function () {
			const resp = await rs.activity({ app: app1, dt: 60 });
			resp.should.have.keys("activity");
			resp.activity.should.equal(5);
		});
		it("Get the Session for token4", async function () {
			const resp = await rs.get({
				app: app1,
				token: token4
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.should.have.keys("id", "r", "w", "ttl", "idle", "ip", "d");
				resp.id.should.equal("user1");
				resp.ttl.should.equal(30);
				should.equal(resp.d.foo, "bar");
			}
		});
	});

	describe("SET", function () {
		it("Set some params for token1 with no d: should fail", async function () {
			try {
				// @ts-expect-error testing purposes
				await rs.set({ app: app1, token: token1 });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("No d supplied");
			}
		});
		it("Set some params for token1 with d being an array", async function () {
			try {
				// @ts-expect-error testing purposes
				await rs.set({ app: app1, token: token1, d: [12, "bla"] });
				throw new Error("Test Failed");
			} catch (error) {
				console.log(error);
				const err = error as Error;
				err.message.should.equal("d must be an object");
			}
		});
		it("Set some params for token1 with d being a string: should fail", async function () {
			try {
				// @ts-expect-error testing purposes
				await rs.set({ app: app1, token: token1, d: "someString" });
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("d must be an object");
			}
		});
		it("Set some params for token1 with forbidden type (array): should fail", async function () {
			try {
				await rs.set({
					app: app1, token: token1, d: {
						// @ts-expect-error testing purposes
						arr: [
							1,
							2,
							3
						]
					}
				});
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("d.arr has a forbidden type. Only strings, numbers, boolean and null are allowed.");
			}
		});
		it("Set some params for token1 with forbidden type (object): should fail", async function () {
			try {
				await rs.set({
					app: app1, token: token1, d: {
						// @ts-expect-error testing purposes
						obj: {
							bla: 1
						}
					}
				});
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("d.obj has a forbidden type. Only strings, numbers, boolean and null are allowed.");
			}
		});
		it("Set some params for token1 with an empty object: should fail", async function () {
			// TODO find a way to enforce one propety
			try {
				await rs.set({
					app: app1, token: token1, d: {}
				});
				throw new Error("Test Failed");
			} catch (error) {
				const err = error as Error;
				err.message.should.equal("d must containt at least one key.");
			}
		});
		it("Set some params for token1: should fail as token1 was killed", async function () {
			const resp = await rs.set({ app: app1, token: token1, d: { str: "haha" } });
			should.equal(resp, null);
		});
		it("Set some params for token3: should work", async function () {
			const resp = await rs.set({ app: app2, token: token3, d: { hi: "ho", count: 120, premium: true, nix: null } });
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.id.should.equal("user1");
			}
		});
		it("Get the session for token3: should work and contain new values", async function () {
			const resp = await rs.get({
				app: app2,
				token: token3
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				should.exist(resp.d);
				resp.d.should.have.keys("hi", "count", "premium");
			}
		});
		it("Remove a param from token3: should work", async function () {
			const resp = await rs.set({ app: app2, token: token3, d: { hi: null } });
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.id.should.equal("user1");
				resp.d.should.have.keys("count", "premium");
			}
		});
		it("Get the session for token3: should work and contain modified values", async function () {
			const resp = await rs.get({
				app: app2,
				token: token3
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.d.should.have.keys("count", "premium");
			}
		});
		it("Remove all remaining params from token3: should work", async function () {
			const resp = await rs.set({ app: app2, token: token3, d: { count: null, premium: null } });
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.id.should.equal("user1");
				resp.should.not.have.keys("d");
			}
		});
		it("Get the session for token3: should work and not contain the d key", async function () {
			const resp = await rs.get({
				app: app2,
				token: token3
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.should.not.have.keys("d");
			}
		});
		it("Remove all remaining params from token3 again: should work", async function () {
			const resp = await rs.set({ app: app2, token: token3, d: { count: null, premium: null } });
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.id.should.equal("user1");
				resp.should.not.have.keys("d");
			}
		});
		it("Get the session for token3: should work and not contain the d key", async function () {
			const resp = await rs.get({
				app: app2,
				token: token3
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.should.not.have.keys("d");
			}
		});
		it("Set some params for token3: should work", async function () {
			const resp = await rs.set({ app: app2, token: token3, d: { a: "sometext", b: 20, c: true, d: false } });
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.id.should.equal("user1");
				resp.should.not.have.keys("d");
				resp.d.should.have.keys("a", "b", "c", "d");
				if (resp.d.a && resp.d.b && resp.d.c && resp.d.d) {
					resp.d.a.should.equal("sometext");
					resp.d.b.should.equal(20);
					resp.d.c.should.equal(true);
					resp.d.d.should.equal(false);
				}
			}
		});
		it("Modify some params for token3: should work", async function () {
			const resp = await rs.set({
				app: app2, token: token3, d: {
					a: false, b: "some_text", c: 20, d: true, e: 20.212
				}
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.id.should.equal("user1");
				resp.should.not.have.keys("d");
				resp.d.should.have.keys("a", "b", "c", "d", "e");
				if (resp.d.a && resp.d.b && resp.d.c && resp.d.d && resp.d.e) {
					resp.d.a.should.equal(false);
					resp.d.b.should.equal("some_text");
					resp.d.c.should.equal(20);
					resp.d.d.should.equal(true);
					resp.d.e.should.equal(20.212);
				}
			}
		});
		it("Get the params for token3: should work", async function () {
			const resp = await rs.get({
				app: app2,
				token: token3
			});
			should.notEqual(resp, null);
			if (resp !== null) {
				resp.should.be.an.Object();
				resp.id.should.equal("user1");
				resp.should.not.have.keys("d");
				resp.d.should.have.keys("a", "b", "c", "d", "e");
				if (resp.d.a && resp.d.b && resp.d.c && resp.d.d && resp.d.e) {
					resp.d.a.should.equal(false);
					resp.d.b.should.equal("some_text");
					resp.d.c.should.equal(20);
					resp.d.d.should.equal(true);
					resp.d.e.should.equal(20.212);
				}
			}
		});
	});


	describe("CLEANUP", function () {
		it("Remove all sessions from app1", async function () {
			const resp = await rs.killall({
				app: app1
			});
			should.exist(resp.kill);
		});
		it("Remove all sessions from app2", async function () {
			const resp = await rs.killall({
				app: app2
			});
			should.exist(resp.kill);
		});
		it("Issue the Quit Command.", async function () {
			await rs.quit();
		});
	});

});

