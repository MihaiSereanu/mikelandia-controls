export function createActor(overrides = {}) {
  return {
    id: "hero", uuid: "Actor.hero", documentName: "Actor", type: "character",
    name: "Hero", img: "hero.webp", items: [], effects: [],
    system: { attributes: { hp: { value: 7, max: 12, temp: 2 } }, abilities: { str: { value: 14 } } },
    testUserPermission: (_user, level) => ["OWNER", "OBSERVER"].includes(level),
    ...overrides
  };
}

export function collection(documents = []) {
  const result = [...documents];
  result.get = id => result.find(document => document.id === id);
  return result;
}

export function createGame(actors = [], systemId = "dnd5e") {
  return {
    system: { id: systemId }, world: { id: "world" },
    user: { id: "player", isGM: false, targets: new Set() }, users: [],
    actors: collection(actors), journal: [], messages: [],
    settings: { get: () => undefined }, modules: new Map()
  };
}

export function installGlobals(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
}

export function createHooks() {
  const listeners = new Map();
  return {
    on(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
      return callback;
    },
    off(name, callback) { listeners.get(name)?.delete(callback); },
    emit(name, ...args) { for (const callback of listeners.get(name) ?? []) callback(...args); },
    call(name, ...args) {
      for (const callback of listeners.get(name) ?? []) if (callback(...args) === false) return false;
      return true;
    },
    count(name) { return listeners.get(name)?.size ?? 0; }
  };
}
