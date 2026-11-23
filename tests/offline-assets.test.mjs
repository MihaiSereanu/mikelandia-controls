import test from "node:test";
import assert from "node:assert/strict";
import { prepareOfflineReader } from "../src/offline/assets.mjs";
import { installGlobals } from "./helpers/foundry.mjs";

test("missing static worker reports the deployment problem before downloading the module graph and retries cleanly", async t => {
  const requested = []; let cacheOpened = false;
  installGlobals(t, { navigator: { serviceWorker: {} }, caches: { open: async () => { cacheOpened = true; throw new Error("Unexpected graph download"); } },
    fetch: async url => { requested.push(url.href); return new Response("Missing", { status: 404 }); } });
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(prepareOfflineReader({ base: "https://example.test/foundry/" }), /Offline page needs updating: \/foundry\/mobile\/sw\.js returned HTTP 404/);
  assert.deepEqual(requested, ["https://example.test/foundry/mobile/sw.js", "https://example.test/foundry/mobile/sw.js"]);
  assert.equal(cacheOpened, false);
});
