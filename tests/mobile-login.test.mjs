import test from "node:test";
import assert from "node:assert/strict";
import { backgroundUrl, createFoundryClient, foundryRoutes, safeRedirect } from "../mobile-login/foundry-client.mjs";

const routes = foundryRoutes("https://example.test/foundry/mobile/");
function socketMock({ session = { sessionId: "test-session" }, data = { world: { id: "test" } }, silent = false } = {}) {
  const listeners = new Map();
  const socket = {
    connected: false, closed: false,
    on: (name, callback) => listeners.set(name, callback),
    off: name => listeners.delete(name),
    connect() { this.connected = true; queueMicrotask(() => listeners.get("session")?.(session)); },
    disconnect() { this.closed = true; this.connected = false; },
    emit(name, callback) { assert.equal(name, "getJoinData"); if (!silent) callback(data); }
  };
  return socket;
}

test("same-origin routes retain a Foundry route prefix and reject non-mobile paths", () => {
  assert.equal(routes.join, "https://example.test/foundry/join");
  assert.equal(routes["socket.io"], "https://example.test/foundry/socket.io");
  assert.throws(() => foundryRoutes("https://example.test/login"));
  assert.equal(safeRedirect("/foundry/game?test=1", routes), "https://example.test/foundry/game?test=1");
  for (const redirect of ["https://other.test/game", "javascript:alert(1)", "/setup"]) assert.throws(() => safeRedirect(redirect, routes));
  assert.equal(backgroundUrl("worlds/test/background.webp", routes), "https://example.test/foundry/worlds/test/background.webp");
  assert.equal(backgroundUrl('javascript:alert(1)', routes), null);
});

test("native session is established once; join data refreshes reuse the connection", async () => {
  const socket = socketMock();
  const requests = [];
  const client = createFoundryClient({ routes, io: options => {
    assert.equal(options.path, "/foundry/socket.io");
    assert.equal(options.autoConnect, false);
    return socket;
  }, fetch: async (url, options) => { requests.push({ url, options }); return { ok: true }; } });
  assert.equal((await client.getJoinData()).world.id, "test");
  await client.getJoinData();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, routes.join);
  assert.equal(requests[0].options.credentials, "same-origin");
  client.close();
  assert.equal(socket.closed, true);
  await assert.rejects(client.getJoinData(), /closed/);
});

test("no-world response, invalid session, and socket timeout remain bounded", async () => {
  const fetch = async () => ({ ok: true });
  const empty = createFoundryClient({ routes, fetch, io: () => socketMock({ data: {} }) });
  assert.deepEqual(await empty.getJoinData(), {});
  empty.close();
  const socket = socketMock({ session: null });
  const invalid = createFoundryClient({ routes, fetch, io: () => socket, timeoutMs: 15 });
  await assert.rejects(invalid.getJoinData(), /login session/);
  assert.equal(socket.closed, true);
  invalid.close();
  const silent = createFoundryClient({ routes, fetch, io: () => socketMock({ silent: true }), timeoutMs: 15 });
  await assert.rejects(silent.getJoinData(), /too long/);
  silent.close();
});

test("credentials go only to native join; failures never become redirects", async () => {
  let reply = { ok: true, status: 200, text: async () => JSON.stringify({ status: "success", redirect: "/foundry/game" }) };
  const requests = [];
  const client = createFoundryClient({ routes, fetch: async (url, options) => { requests.push({ url, options }); return reply; } });
  assert.equal(await client.join("user-id", "not-a-real-password"), routes.game);
  assert.deepEqual(JSON.parse(requests[0].options.body), { action: "join", userId: "user-id", password: "not-a-real-password" });
  assert.equal(requests[0].url, routes.join);
  reply = { ok: false, status: 401, text: async () => "JOIN.ErrorInvalidPassword" };
  await assert.rejects(client.join("user-id", "bad"), /password was not accepted/);
  reply = { ok: true, status: 200, text: async () => "<html>World stopped</html>" };
  await assert.rejects(client.join("user-id", ""), /standard login/);
  reply = { ok: true, status: 200, text: async () => JSON.stringify({ status: "success", redirect: "https://other.test/game" }) };
  await assert.rejects(client.join("user-id", ""), /Unexpected login destination/);
  client.close();
});
