/** Skip the hidden board's screen draw, retaining Foundry's animation/perception ticker. */
export function enableHiddenCanvasRendering(scope, {
  getCanvas = () => globalThis.canvas,
  document = globalThis.document
} = {}) {
  let release = null, renderer = null;
  const reconcile = () => {
    const app = getCanvas()?.app;
    if (app?.renderer === renderer) return;
    release?.(); release = null; renderer = null;
    const next = app?.renderer;
    if (!next || typeof next.render !== "function") return;
    const descriptor = Object.getOwnPropertyDescriptor(next, "render");
    if (descriptor?.configurable === false) return;
    const original = next.render;
    const guarded = function (displayObject, options, ...args) {
      // Extraction and render-to-texture calls remain available. Only the main
      // board belongs to this policy; Dice So Nice has its own renderer.
      if (displayObject === app.stage && !options?.renderTexture
        && (document?.visibilityState === "hidden"
          || app.view?.closest?.('[data-mc-mobile-ui-state="blocked"]'))) return;
      return original.call(this, displayObject, options, ...args);
    };
    Object.defineProperty(next, "render", { configurable: true, writable: true, value: guarded });
    renderer = next;
    release = () => {
      if (next.render !== guarded) return;
      if (descriptor) Object.defineProperty(next, "render", descriptor);
      else delete next.render;
    };
  };
  scope.hook("canvasReady", reconcile);
  scope.own(() => { release?.(); release = null; renderer = null; });
  reconcile();
}
