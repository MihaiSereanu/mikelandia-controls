export const OFFLINE_VERSION = 1;
export const OFFLINE_DATABASE = "mikelandia.offline";

/** Both the authenticated writer and standalone reader use this browser database. */
export function createOfflineStorage({ indexedDB = globalThis.indexedDB, onChange = () => {} } = {}) {
  let database;
  const open = () => database ??= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new Error("Offline storage is unavailable in this browser.")); return; }
    const request = indexedDB.open(OFFLINE_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("libraries", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Mikelandia tabs to update offline storage."));
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
  });
  const transact = async (mode, operation) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("libraries", mode);
      let result;
      transaction.oncomplete = () => { if (mode === "readwrite") onChange(); resolve(result); };
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("Offline storage failed."));
      operation(transaction.objectStore("libraries"), value => { result = value; });
    });
  };
  return Object.freeze({
    list: () => transact("readonly", (store, done) => { store.getAll().onsuccess = event => done(event.target.result); }),
    get: id => transact("readonly", (store, done) => { store.get(id).onsuccess = event => done(event.target.result ?? null); }),
    enable: meta => transact("readwrite", (store, done) => {
      const record = { ...meta, version: OFFLINE_VERSION, token: globalThis.crypto.randomUUID(), enabled: true, data: null };
      store.put(record); done(record);
    }),
    forget: id => transact("readwrite", store => { store.delete(id); }),
    // The transaction prevents an in-flight save from resurrecting a forgotten library,
    // including when the reader forgets it in another tab.
    save: (id, token, data, metadata = {}) => transact("readwrite", (store, done) => {
      store.get(id).onsuccess = event => {
        const current = event.target.result;
        if (!current?.enabled || current.token !== token) { done(false); return; }
        if (current.data?.startedAt > data.startedAt) { done(false); return; }
        store.put({ ...current, ...metadata, id, token, enabled: true, version: OFFLINE_VERSION, data }); done(true);
      };
    }),
    close: async () => { const pending = database; database = undefined; if (pending) (await pending).close(); }
  });
}
export function libraryIdentity(base, world, user) {
  if (!world?.id || !user?.id || user.isGM) throw new Error("A player and world are required for offline saving.");
  const url = new URL(base); url.search = ""; url.hash = "";
  const server = `${url.origin}${url.pathname.replace(/\/?$/, "/")}`;
  return { id: JSON.stringify([server, world.id, world.systemId, user.id]), server, world, user };
}
