import { createMobileBootstrap } from "/src/ui/bootstrap/bootstrap-loader.mjs";

const checks = [];
function check(value, description) {
  if (!value) throw new Error(description);
  checks.push(description);
}
try {
  const theme = new URLSearchParams(location.search).get("theme");
  const loader = createMobileBootstrap();
  const normalScreen = () => {
    loader.mount({ theme });
    loader.setWakeState("off", { checked: false });
  };
  normalScreen();
  const surface = loader.surface;
  const heading = surface.querySelector("h1");
  const icon = surface.querySelector("img");
  await icon.decode();
  const iconBounds = icon.getBoundingClientRect();
  check(icon.naturalWidth === 512 && icon.naturalHeight === 512 && iconBounds.top >= 0 && iconBounds.bottom < heading.getBoundingClientRect().top, "selected MC icon loads above the loading text within the viewport");
  check(heading.textContent === "Loading your game...", "loading heading keeps the requested text");
  check(!surface.querySelector(".mc-loading-checkpoints, .mc-mobile-bootstrap__activity, .mc-mobile-bootstrap__timing"), "progress and timers remain removed");
  check([...surface.firstElementChild.children].filter(el => el.getBoundingClientRect().height > 0).length === 2, "only icon with heading and bottom wake checkbox are visible during loading");
  const label = heading.querySelector(".mc-mobile-bootstrap__label");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pulse = label.getAnimations()[0];
  if (reducedMotion) check(!pulse, "reduced motion disables the loading pulse");
  else {
    check(Boolean(pulse) && heading.querySelector(".mc-mobile-bootstrap__ellipsis span").getAnimations().length > 0, "loading text pulses with animated dots");
    pulse.pause(); pulse.currentTime = 0;
    const bright = Number(getComputedStyle(label).opacity);
    pulse.currentTime = 900;
    check(Number(getComputedStyle(label).opacity) < bright, "pulse visibly changes the text opacity");
    pulse.play();
  }
  check(surface.dataset.theme === theme, "requested loading theme is applied");
  check(document.documentElement.scrollWidth <= innerWidth, "loading screen does not overflow horizontally");
  const wake = loader.wakeControl;
  const bounds = wake.getBoundingClientRect();
  check(bounds.height >= 44 && bounds.bottom <= innerHeight && bounds.bottom > innerHeight * 0.8, "wake checkbox stays at the bottom within the viewport");
  check(heading.getBoundingClientRect().bottom < bounds.top, "loading heading sits above the checkbox");
  loader.setWakeState("active", { checked: true });
  check(wake.getAttribute("aria-checked") === "true" && !wake.disabled, "wake checkbox retains its checked state");
  const prompt = loader.promptForWakeChoice();
  check(wake.hidden && !loader.wakePromptYesControl.closest("[hidden]"), "gesture confirmation appears only when requested");
  check(document.activeElement === loader.wakePromptYesControl, "confirmation receives keyboard focus");
  loader.resolveWakePrompt(false);
  check(await prompt === false, "wake confirmation resolves the selected choice");
  normalScreen();
  loader.showRecovery({ title: "Loading interrupted", message: "Please refresh", actionLabel: "Refresh game" });
  check(surface.getAttribute("role") === "alertdialog" && loader.recoveryControl.textContent === "Refresh game" && loader.recoveryControl.getBoundingClientRect().height >= 44, "startup recovery retains an accessible refresh action");
  check(label.getAnimations().length === 0, "loading animation stops on recovery");
  normalScreen();
  check(await loader.complete() && surface.classList.contains("is-complete"), "successful loading completes normally");
  check(label.getAnimations().length === 0 && heading.querySelector(".mc-mobile-bootstrap__ellipsis span").getAnimations().length === 0, "text and dot animations stop when loading completes");
  loader.unmount();
  check(!document.body.classList.contains("mc-mobile-booting") && !surface.isConnected, "unmount removes the loading surface and scroll lock");
  normalScreen();
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", error: error.message, checks });
}
