import { icon, node } from "./dom.mjs";
import { bindImageViewer } from "./image-viewer-controller.mjs";

/** Shared Mikelandia Controls artwork viewer for Journal pages and Character portraits. */
export function renderImageViewer(imageRecord, onClose, scope, { localize = (_key, fallback) => fallback } = {}) {
  if (!imageRecord?.src) return null;
  const name = String(imageRecord.name || localize("MIKELANDIA_CONTROLS.ImageViewer.Image", "Image"));
  const image = node("img", { attrs: { src: imageRecord.src, alt: name, draggable: "false" } });
  const stage = node("div", { className: "mc-image-viewer-stage mc-journal-image-stage", children: [image] });
  const controller = bindImageViewer(stage, image, scope);
  const layer = node("div", {
    className: "mc-image-viewer mc-journal-image-viewer",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": name },
    children: [
      node("header", { children: [node("strong", { text: name }), node("button", { attrs: { type: "button", "aria-label": localize("MIKELANDIA_CONTROLS.ImageViewer.Close", "Close image viewer") }, on: { click: onClose }, children: [icon("fa-xmark")] }, scope)] }),
      stage,
      node("nav", { attrs: { "aria-label": localize("MIKELANDIA_CONTROLS.ImageViewer.ZoomControls", "Image zoom controls") }, children: [
        node("button", { attrs: { type: "button", "aria-label": localize("MIKELANDIA_CONTROLS.ImageViewer.ZoomOut", "Zoom out") }, on: { click: () => controller.zoomBy(1 / 1.35) }, children: [icon("fa-minus")] }, scope),
        node("button", { attrs: { type: "button" }, on: { click: controller.reset }, children: [icon("fa-expand"), node("span", { text: localize("MIKELANDIA_CONTROLS.ImageViewer.Fit", "Fit") })] }, scope),
        node("button", { attrs: { type: "button", "aria-label": localize("MIKELANDIA_CONTROLS.ImageViewer.ZoomIn", "Zoom in") }, on: { click: () => controller.zoomBy(1.35) }, children: [icon("fa-plus")] }, scope)
      ] })
    ]
  });
  scope.listen(layer, "keydown", (event) => { if (event.key === "Escape") onClose(); });
  queueMicrotask(() => layer.querySelector?.("header button")?.focus?.());
  return layer;
}
