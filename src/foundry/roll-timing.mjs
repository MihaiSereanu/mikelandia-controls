/** Opt-in, in-memory timing of native roll milestones on this client. */
export function createRollTimingGateway({
  getHooks = () => globalThis.Hooks,
  getDocument = () => globalThis.document,
  now = () => globalThis.performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = id => clearTimeout(id)
} = {}) {
  let enabled = false, sequence = 0;
  const history = [], active = new Map();
  const idle = Object.freeze({ mark() {}, finish() {}, dispose() {} });
  const begin = ({ actorSourceUuid, actionId } = {}) => {
    if (!enabled) return idle;
    const started = now();
    const record = { id: ++sequence, actorSourceUuid: String(actorSourceUuid ?? ""), actionId: String(actionId ?? ""), milestones: [] };
    const cleanups = new Set();
    let disposed = false, messageId = null;
    const mark = phase => {
      if (disposed || typeof phase !== "string" || record.milestones.some(entry => entry.phase === phase)) return;
      record.milestones.push({ phase, ms: Math.max(0, now() - started) });
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      active.delete(record.id);
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    };
    active.set(record.id, dispose);
    history.push(record);
    if (history.length > 20) active.get(history.shift().id)?.();
    const hooks = getHooks();
    const on = (name, callback) => {
      const id = hooks?.on?.(name, callback);
      if (id !== undefined) cleanups.add(() => hooks.off?.(name, id));
    };
    const matchesConfig = config => Boolean(record.actorSourceUuid && config?.actorUuid === record.actorSourceUuid);
    const matchesMessage = message => {
      const speaker = message?.speaker;
      const actorMatches = speaker?.actor && record.actorSourceUuid === `Actor.${speaker.actor}`;
      const tokenMatches = speaker?.scene && speaker?.token && record.actorSourceUuid.startsWith(`Scene.${speaker.scene}.Token.${speaker.token}`);
      return Boolean((actorMatches || tokenMatches) && (messageId === null || message.id === messageId));
    };
    const watchVisible = (rendered, phase) => {
      const element = rendered?.[0] ?? rendered;
      if (!element || record.milestones.some(entry => entry.phase === phase)) return;
      const view = element.ownerDocument?.defaultView ?? getDocument()?.defaultView;
      let observer = null, frame = null, finished = false;
      const stop = () => {
        finished = true;
        observer?.disconnect();
        if (frame !== null) view?.cancelAnimationFrame?.(frame);
        cleanups.delete(stop);
      };
      const sample = () => {
        if (disposed || finished) return;
        observer?.disconnect();
        let visible = element.isConnected === true;
        for (let node = element; node; node = node.parentElement) {
          const style = view?.getComputedStyle?.(node);
          if (node.hidden || style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse") visible = false;
          if (style?.opacity === "0") visible = false;
          observer?.observe(node, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
        }
        if (visible) { mark(phase); stop(); }
      };
      if (typeof view?.MutationObserver === "function") observer = new view.MutationObserver(sample);
      cleanups.add(stop);
      // Render hooks can precede insertion and other module hooks. Sample the
      // final attached presentation on the next frame, then observe only its
      // own ancestor chain if a module is keeping it hidden.
      if (typeof view?.requestAnimationFrame === "function") frame = view.requestAnimationFrame(() => { frame = null; sample(); });
      else sample();
    };
    on("renderApplicationV2", (application, rendered) => {
      if (!matchesConfig(application?.config)) return;
      mark("dialog-rendered");
      watchVisible(application?.element ?? rendered, "dialog-visible");
    });
    for (const name of ["SD-Stat-Check", "SD-Player-Attack", "SD-Player-Spell"]) on(name, config => {
      if (matchesConfig(config)) mark("roll-submitted");
    });
    on("createChatMessage", message => {
      if (!matchesMessage(message)) return;
      messageId = message.id;
      mark("chat-created");
    });
    on("renderChatMessageHTML", (message, rendered) => {
      if (!matchesMessage(message)) return;
      messageId = message.id;
      mark("chat-rendered");
      watchVisible(rendered, "chat-visible");
    });
    const expiry = schedule(() => { mark("observation-ended"); dispose(); }, 30000);
    cleanups.add(() => cancel(expiry));
    mark("action-started");
    return Object.freeze({ mark, finish() {
      mark("native-return");
      // A cancelled/failed workflow must not capture the next roll by this actor.
      if (messageId === null) dispose();
    }, dispose });
  };
  return Object.freeze({
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) for (const dispose of [...active.values()]) dispose();
      return enabled;
    },
    get enabled() { return enabled; },
    begin,
    snapshot: () => history.map(record => ({ ...record, milestones: record.milestones.map(entry => ({ ...entry })) })),
    reset() {
      for (const dispose of [...active.values()]) dispose();
      history.length = 0;
    }
  });
}
