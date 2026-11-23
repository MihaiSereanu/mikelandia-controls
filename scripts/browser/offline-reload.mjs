/** Real service worker + browser network loss, in the existing CDP harness. */
export async function checkOfflineReload(send, origin, checks) {
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  const until = async expression => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      try { if (await evaluate(expression)) return; } catch { /* Navigation replaces the execution context. */ }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error("Offline reload check timed out: " + expression);
  };
  await evaluate(`import('/modules/mikelandia-controls/src/offline/assets.mjs').then(module => module.prepareOfflineReader({base: location.origin + '/'}))`);
  await send("Page.navigate", { url: origin + "/mobile/index.html" });
  await until("Boolean(document.getElementById('saved-characters')?.textContent.includes('games / players'))");
  await until("Boolean(navigator.serviceWorker.controller)");
  checks.push("standalone reader installs a controlling service worker independently of Foundry");
  await send("Network.enable", {});
  try {
    await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await send("Page.reload", { ignoreCache: true });
    await until("Boolean(document.getElementById('saved-characters')?.textContent.includes('games / players'))");
    await evaluate(`(() => {
      document.getElementById('saved-characters').click();
      const section = [...document.querySelectorAll('#offline-library > section')].find(node => node.textContent.includes('The Enemy Within'));
      section.querySelector('button').click();
    })()`);
    await until("Boolean(document.querySelector('.mc-mobile-app [data-profile-tab]'))");
    if (!await evaluate("document.querySelector('.mc-mobile-app').textContent.includes('Elsa Becker') && document.querySelector('[data-route=chat]').disabled")) throw new Error("Saved content did not survive offline reload.");
    checks.push("cold page reload with browser network disabled opens saved characters and Journals");
    if (!await evaluate("document.querySelectorAll('.mc-native-sheet-identity img').length > 0 && [...document.querySelectorAll('.mc-native-sheet-identity img')].every(image => image.src.startsWith('blob:'))")) throw new Error("Reader attempted live media URLs.");
    checks.push("offline reader uses stored image blobs after reload");
  } finally {
    await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  if (!await evaluate("Boolean(document.querySelector('.mc-mobile-app')) && location.pathname.includes('/mobile/')")) throw new Error("Connection recovery left the reader.");
  checks.push("network recovery leaves the saved reader open");
}
