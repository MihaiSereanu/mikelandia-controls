import { createMobileBootstrap } from "/src/ui/bootstrap/bootstrap-loader.mjs";

const checks = [];
function check(value, description) {
  if (!value) throw new Error(description);
  checks.push(description);
}
try {
  const params = new URLSearchParams(location.search);
  const theme = params.get("theme");
  const commonDisplay = params.has("common-display");
  let commonDisplayUnrelated;
  if (commonDisplay) {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "/tests/browser/fixtures/monks-common-display-14.01-root-hide.css";
    const loaded = new Promise((resolve, reject) => {
      style.addEventListener("load", resolve, { once: true });
      style.addEventListener("error", reject, { once: true });
    });
    document.head.append(style);
    await loaded;
    document.body.classList.add("hide-ui");
    commonDisplayUnrelated = document.createElement("aside");
    commonDisplayUnrelated.textContent = "Unrelated native UI remains hidden";
    document.body.append(commonDisplayUnrelated);
  }
  const displayed = element => getComputedStyle(element).display !== "none"
    && getComputedStyle(element).visibility === "visible"
    && element.getBoundingClientRect().height > 0;
  const hitControl = element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return hit === element || element.contains(hit);
  };
  const loader = createMobileBootstrap();
  const normalScreen = () => {
    loader.unmount();
    loader.mount({ theme });
    loader.setWakeState("off", { checked: false });
  };
  normalScreen();
  const surface = loader.surface;
  check(displayed(surface), "loading surface is visible before the mobile runtime starts");
  if (commonDisplay) {
    check(document.body.classList.contains("hide-ui") && !displayed(commonDisplayUnrelated), "Common Display keeps its Hide UI state and conceals unrelated native UI");
    check(!document.body.classList.contains("mc-mobile-running"), "bootstrap protection does not depend on a running mobile shell");
  }
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
  let wakeClicks = 0;
  wake.addEventListener("click", () => { wakeClicks++; });
  check(hitControl(wake), "wake checkbox is reachable through pointer hit testing");
  wake.click();
  check(wakeClicks === 1, "visible wake checkbox accepts an action");
  check(bounds.height >= 44 && bounds.bottom <= innerHeight && bounds.bottom > innerHeight * 0.8, "wake checkbox stays at the bottom within the viewport");
  check(heading.getBoundingClientRect().bottom < bounds.top, "loading heading sits above the checkbox");
  loader.setWakeState("active", { checked: true });
  check(wake.getAttribute("aria-checked") === "true" && !wake.disabled, "wake checkbox retains its checked state");
  const prompt = loader.promptForWakeChoice();
  const completion = loader.complete({ beforeDismiss: () => prompt });
  check(wake.hidden && !loader.wakePromptYesControl.closest("[hidden]"), "gesture confirmation appears only when requested");
  check(document.activeElement === loader.wakePromptYesControl, "confirmation receives keyboard focus");
  check(hitControl(loader.wakePromptYesControl), "wake confirmation remains reachable through pointer hit testing");
  for (let attempt = 0; attempt < 3; attempt++) loader.mount({ theme });
  check(wake.hidden && !loader.wakePromptYesControl.closest("[hidden]") && hitControl(loader.wakePromptYesControl)
    && document.activeElement === loader.wakePromptYesControl, "repeated mount preserves the pending Continue prompt and its focus");
  check(label.textContent === "Loading Complete" && !heading.classList.contains("is-loading"), "repeated mount does not restart the loading phase while awaiting Continue");
  loader.resolveWakePrompt(false);
  check(await prompt === false, "wake confirmation resolves the selected choice");
  check(await completion && surface.classList.contains("is-complete"), "completion resolves after repeated mount and the pending Continue choice");
  loader.mount({ theme });
  check(surface.classList.contains("is-complete") && !heading.classList.contains("is-loading"), "repeated mount preserves a completed loading phase");
  normalScreen();
  loader.showRecovery({ title: "Loading interrupted", message: "Please refresh", actionLabel: "Refresh game" });
  check(surface.getAttribute("role") === "alertdialog" && loader.recoveryControl.textContent === "Refresh game" && loader.recoveryControl.getBoundingClientRect().height >= 44, "startup recovery retains an accessible refresh action");
  check(surface.classList.contains("is-failed") && displayed(surface) && hitControl(loader.recoveryControl), "failed startup recovery remains visible with a reachable refresh control");
  loader.mount({ theme });
  check(surface.classList.contains("is-failed") && surface.getAttribute("role") === "alertdialog"
    && label.textContent === "Loading interrupted" && hitControl(loader.recoveryControl), "repeated mount does not clear failed startup recovery");
  let recoveryClicks = 0;
  loader.recoveryControl.addEventListener("click", () => { recoveryClicks++; });
  loader.recoveryControl.click();
  check(recoveryClicks === 1, "visible recovery control accepts an action");
  if (commonDisplay) check(document.body.classList.contains("hide-ui") && !displayed(commonDisplayUnrelated), "recovery preserves Common Display Hide UI and the hidden native UI");
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
