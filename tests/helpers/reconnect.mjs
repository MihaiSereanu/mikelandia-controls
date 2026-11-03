import { createFoundryAuthoritativeSessionGateway } from "../../src/foundry/session/authoritative-session-gateway.mjs";

export const recoveryCollections = ["User", "Folder", "Actor", "Combat", "JournalEntry", "ChatMessage"];
const keys = ["users", "folders", "actors", "combats", "journal", "messages"];

export function recoveryFixture({ count = 2, requestSources, now, yieldControl = async () => {}, gatewayFactory = createFoundryAuthoritativeSessionGateway } = {}) {
  const stats = { prepared: 0, chat: 0, trees: 0, requests: [] };
  class Document {
    constructor(source) { this._source = structuredClone(source); this.id = source._id; }
    toObject() { return structuredClone(this._source); }
    updateSource(source) { this._source = structuredClone(source); stats.prepared++; return { changed: true }; }
    static cleanData(source) { return structuredClone(source); }
    static fromSource(source) { stats.prepared++; return new Document(source); }
  }
  const sources = Object.fromEntries(recoveryCollections.map(name => [name, Array.from({ length: name === "Actor" ? count : 1 }, (_, i) => ({ _id: `${name}-${i}`, name: `${name} ${i}`, ownership: { default: 2 } }))]));
  const game = { user: { id: "User-0" }, world: { id: "world" }, collections: new Map(), data: {} };
  recoveryCollections.forEach((name, i) => {
    const collection = new Map(sources[name].map(source => [source._id, new Document(source)]));
    collection.documentClass = Document;
    collection.initializeTree = () => { stats.trees++; };
    game.collections.set(name, collection);
    game.data[keys[i]] = structuredClone(sources[name]);
  });
  const gateway = gatewayFactory({
    getGame: () => game, getUi: () => ({ chat: { render: () => { stats.chat++; } } }), now, yieldControl,
    requestSources: async request => {
      stats.requests.push(request.documentName);
      return requestSources ? requestSources(request, sources) : structuredClone(sources[request.documentName]);
    }
  });
  gateway.captureInitialSources(); gateway.bindInitialDocuments();
  return { game, sources, stats, gateway };
}
