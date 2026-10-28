import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryPreferencesGateway } from "../src/foundry/preferences.mjs";
import { foundryRoutes } from "../mobile-login/foundry-client.mjs";

for (const prefix of ["", "/foundry"]) {
  test(`mobile logout returns to login under ${prefix || "/"}`, async () => {
    const destinations = [];
    const gateway = createFoundryPreferencesGateway({
      getGame: () => ({ logOut() { assert.fail("native logout would navigate to /join"); } }),
      getRoute: path => `${prefix}/${path}`,
      navigate: url => destinations.push(url)
    });
    assert.deepEqual(await gateway.logout(), { ok: true });
    assert.deepEqual(destinations, [`${prefix}/mobile/`]);
    const routes = foundryRoutes(`https://example.test${destinations[0]}`);
    assert.equal(routes.join, `https://example.test${prefix}/join`);
    assert.equal(routes.game, `https://example.test${prefix}/game`);
  });
}

test("mobile logout reports navigation failures", async () => {
  const gateway = createFoundryPreferencesGateway({
    getRoute: () => "/mobile",
    navigate: () => { throw new Error("Navigation failed"); }
  });
  await assert.rejects(gateway.logout(), /Navigation failed/);
});
