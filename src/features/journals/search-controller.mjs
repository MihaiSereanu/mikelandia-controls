import { searchJournalIndex } from "./search.mjs";

export function createJournalSearchController({
  store,
  readIndex,
  expectedSession,
  schedule = setTimeout,
  cancel = clearTimeout
}) {
  let generation = 0;
  let timer = null;
  let index = null;
  let disposed = false;
  let suspended = false;

  const stop = () => {
    generation++;
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const run = () => {
    stop();
    if (disposed || suspended) return;
    const query = store.state.journalSearch.query;
    const request = generation;
    store.dispatch({
      type: "journal-search-changed",
      search: { query, loading: Boolean(query.trim()), results: [], error: "" }
    });
    if (!query.trim()) return;
    timer = schedule(async () => {
      timer = null;
      try {
        const loaded = index ?? await readIndex(expectedSession());
        if (disposed || request !== generation) return;
        index = loaded;
        store.dispatch({
          type: "journal-search-changed",
          search: { query, loading: false, results: searchJournalIndex(index, query), error: "" }
        });
      } catch (error) {
        if (!disposed && request === generation) {
          store.dispatch({
            type: "journal-search-changed",
            search: { query, loading: false, results: [], error: String(error?.message ?? error) }
          });
        }
      }
    }, 200);
  };
  return {
    setQuery(query) {
      store.dispatch({
        type: "journal-search-changed",
        search: { ...store.state.journalSearch, query: String(query) }
      });
      run();
    },
    invalidate() {
      index = null;
      run();
    },
    retry() {
      index = null;
      run();
    },
    resume() {
      suspended = false;
      run();
    },
    suspend() {
      suspended = true;
      stop();
      index = null;
      store.dispatch({
        type: "journal-search-changed",
        search: { ...store.state.journalSearch, loading: false, results: [], error: "" }
      });
    },
    dispose() {
      disposed = true;
      stop();
      index = null;
    }
  };
}
