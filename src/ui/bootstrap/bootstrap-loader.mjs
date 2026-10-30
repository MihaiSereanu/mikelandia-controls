import { localizedText } from "../primitives/localized-text.mjs";

/** Navigation startTime and performance.now() share the same monotonic origin. */
export function navigationStartAt(performanceRef = globalThis.performance) {
  const navigation = performanceRef?.getEntriesByType?.("navigation")?.[0];
  return Number.isFinite(navigation?.startTime) && navigation.startTime >= 0 ? navigation.startTime : 0;
}

/** Prevent hidden Foundry text controls from summoning a mobile keyboard. */
export function suppressBootstrapSoftwareKeyboard(scope, surface, {
  getDocument = () => globalThis.document
} = {}) {
  const document = getDocument();
  const blurEditableOutsideBootstrap = (target) => {
    const editable = target?.closest?.("textarea, input, [contenteditable]");
    if (!editable || editable.getAttribute?.("contenteditable") === "false" || surface?.contains?.(editable)) return;
    editable.blur?.();
  };
  blurEditableOutsideBootstrap(document?.activeElement);
  scope.listen(document, "focusin", (event) => blurEditableOutsideBootstrap(event.target), true);
}

/** A dependency-free boot surface which can render before Foundry is ready. */
export function createMobileBootstrap({
  getDocument = () => globalThis.document,
  iconUrl = new URL("../../../assets/mc-512.png", import.meta.url).href,
  localize = (_key, fallback) => fallback
} = {}) {
  const document = getDocument();
  const text = (key, fallback, data) => localizedText(localize, key, fallback, data);
  const root = document.createElement("section");
  root.className = "mc-mobile-bootstrap";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-label", text("MIKELANDIA_CONTROLS.Boot.LoadingLabel", "Mikelandia Controls is loading"));

  const content = document.createElement("div");
  content.className = "mc-mobile-bootstrap__content";
  root.append(content);

  const status = document.createElement("div");
  status.className = "mc-mobile-bootstrap__status";
  const image = document.createElement("img");
  image.className = "mc-mobile-bootstrap__icon";
  image.src = iconUrl;
  image.alt = "Mikelandia Controls";
  image.decoding = "async";
  status.append(image);
  content.append(status);

  const heading = document.createElement("h1");
  heading.className = "mc-mobile-bootstrap__heading";
  const headingText = document.createElement("span");
  headingText.className = "mc-mobile-bootstrap__label";
  headingText.textContent = text("MIKELANDIA_CONTROLS.Boot.LoadingGame", "Loading your game");
  const ellipsis = document.createElement("span");
  ellipsis.className = "mc-mobile-bootstrap__ellipsis";
  ellipsis.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.textContent = ".";
    ellipsis.append(dot);
  }
  heading.append(headingText, ellipsis);
  status.append(heading);

  const wake = document.createElement("button");
  wake.type = "button";
  wake.className = "mc-mobile-bootstrap__wake";
  wake.setAttribute("role", "checkbox");
  wake.setAttribute("aria-checked", "false");
  wake.hidden = true;
  const wakeBox = document.createElement("span");
  wakeBox.className = "mc-mobile-bootstrap__wake-box";
  wakeBox.setAttribute("aria-hidden", "true");
  const wakeCopy = document.createElement("span");
  wakeCopy.className = "mc-mobile-bootstrap__wake-copy";
  const wakeText = document.createElement("span");
  wakeText.textContent = text("MIKELANDIA_CONTROLS.Boot.KeepScreenAwake", "KEEP SCREEN AWAKE");
  const wakeWarning = document.createElement("small");
  wakeWarning.textContent = text("MIKELANDIA_CONTROLS.Boot.KeepAwakeHint", "Prevents your device from sleeping while Mikelandia Controls is open.");
  wakeCopy.append(wakeText, wakeWarning);
  wake.append(wakeBox, wakeCopy);
  content.append(wake);

  const recovery = document.createElement("section");
  recovery.className = "mc-mobile-bootstrap__recovery";
  recovery.hidden = true;
  const recoveryMessage = document.createElement("p");
  const recoveryButton = document.createElement("button");
  recoveryButton.type = "button";
  recovery.append(recoveryMessage, recoveryButton);
  content.append(recovery);

  const wakePrompt = document.createElement("div");
  wakePrompt.className = "mc-mobile-bootstrap__wake-prompt";
  wakePrompt.hidden = true;
  const wakePromptMessage = document.createElement("p");
  wakePromptMessage.textContent = text("MIKELANDIA_CONTROLS.Boot.WakePrompt", "Keep Awake needs a browser-confirmed tap. Continue to enter Mikelandia Controls and activate it.");
  const wakePromptChoice = document.createElement("button");
  wakePromptChoice.type = "button";
  wakePromptChoice.className = "mc-mobile-bootstrap__wake-prompt-choice";
  wakePromptChoice.setAttribute("role", "checkbox");
  wakePromptChoice.setAttribute("aria-checked", "false");
  const wakePromptChoiceBox = document.createElement("span");
  wakePromptChoiceBox.className = "mc-mobile-bootstrap__wake-box";
  wakePromptChoiceBox.setAttribute("aria-hidden", "true");
  const wakePromptChoiceText = document.createElement("span");
  wakePromptChoiceText.textContent = text("MIKELANDIA_CONTROLS.Boot.KeepScreenAwake", "KEEP SCREEN AWAKE");
  wakePromptChoice.append(wakePromptChoiceBox, wakePromptChoiceText);
  const wakePromptActions = document.createElement("div");
  wakePromptActions.className = "mc-mobile-bootstrap__wake-prompt-actions";
  const wakePromptYes = document.createElement("button");
  wakePromptYes.type = "button";
  wakePromptYes.className = "mc-mobile-bootstrap__wake-prompt-yes";
  wakePromptYes.textContent = text("MIKELANDIA_CONTROLS.Boot.Continue", "Continue");
  wakePromptActions.append(wakePromptYes);
  wakePrompt.append(wakePromptMessage, wakePromptChoice, wakePromptActions);
  content.append(wakePrompt);

  let mounted = false;
  let wakePromptWaiter = null;
  let wakePromptVisible = false;
  let recoveryCopy = null;

  const updatePolicy = (policy = {}) => {
    root.dataset.theme = policy.theme === "light" || policy.theme === "dark" ? policy.theme : "system";
    root.dataset.formFactor = policy.formFactor === "tablet" ? "tablet" : "phone";
  };

  const showRecovery = (copy = {}) => {
    recoveryCopy = {
      title: copy.title ?? text("MIKELANDIA_CONTROLS.Boot.LoadingInterrupted", "Loading interrupted"),
      message: copy.message ?? text("MIKELANDIA_CONTROLS.Boot.FoundryStopped", "Foundry stopped responding during startup."),
      actionLabel: copy.actionLabel ?? text("MIKELANDIA_CONTROLS.Boot.RefreshGame", "Refresh game")
    };
    headingText.textContent = recoveryCopy.title;
    heading.classList.remove("is-loading");
    ellipsis.hidden = true;
    recoveryMessage.textContent = recoveryCopy.message;
    recoveryButton.textContent = recoveryCopy.actionLabel;
    recovery.hidden = false;
    root.setAttribute("role", "alertdialog");
    root.setAttribute("aria-label", recoveryCopy.title);
    root.classList.add("is-failed");
  };

  const promptForWakeChoice = () => {
    if (!mounted) return Promise.resolve(null);
    if (wakePromptWaiter) return wakePromptWaiter.promise;
    headingText.textContent = text("MIKELANDIA_CONTROLS.Boot.LoadingComplete", "Loading Complete");
    heading.classList.remove("is-loading");
    ellipsis.hidden = true;
    wakePromptVisible = true;
    wake.hidden = true;
    wakePrompt.hidden = false;
    wakePromptYes.focus?.();
    const promise = new Promise((resolve) => {
      wakePromptWaiter = { promise: null, resolve };
    });
    wakePromptWaiter.promise = promise;
    return promise;
  };

  const resolveWakePrompt = (keepAwake) => {
    const waiter = wakePromptWaiter;
    if (!waiter) return false;
    wakePromptWaiter = null;
    wakePrompt.hidden = true;
    waiter.resolve(Boolean(keepAwake));
    return true;
  };

  return Object.freeze({
    get mounted() {
      return mounted;
    },
    get surface() {
      return root;
    },
    get wakeControl() {
      return wake;
    },
    get recoveryControl() {
      return recoveryButton;
    },
    get wakePromptYesControl() {
      return wakePromptYes;
    },
    get wakePromptChoiceControl() {
      return wakePromptChoice;
    },
    mount(policy = {}) {
      if (mounted) {
        updatePolicy(policy);
        return;
      }
      if (!root.isConnected) (document.body ?? document.documentElement).append(root);
      document.body?.classList.add("mc-mobile-booting");
      root.setAttribute("role", "status");
      root.setAttribute("aria-label", text("MIKELANDIA_CONTROLS.Boot.LoadingLabel", "Mikelandia Controls is loading"));
      root.classList.remove("is-complete", "is-failed");
      heading.classList.add("is-loading");
      headingText.textContent = text("MIKELANDIA_CONTROLS.Boot.LoadingGame", "Loading your game");
      ellipsis.hidden = false;
      recovery.hidden = true;
      wakePromptVisible = false;
      wakePrompt.hidden = true;
      mounted = true;
      updatePolicy(policy);
    },
    updatePolicy,
    refreshLocalization() {
      root.setAttribute("aria-label", text("MIKELANDIA_CONTROLS.Boot.LoadingLabel", "Mikelandia Controls is loading"));
      wakeText.textContent = text("MIKELANDIA_CONTROLS.Boot.KeepScreenAwake", "KEEP SCREEN AWAKE");
      wakeWarning.textContent = text("MIKELANDIA_CONTROLS.Boot.KeepAwakeHint", "Prevents your device from sleeping while Mikelandia Controls is open.");
      wakePromptMessage.textContent = text("MIKELANDIA_CONTROLS.Boot.WakePrompt", "Keep Awake needs a browser-confirmed tap. Continue to enter Mikelandia Controls and activate it.");
      wakePromptChoiceText.textContent = text("MIKELANDIA_CONTROLS.Boot.KeepScreenAwake", "KEEP SCREEN AWAKE");
      wakePromptYes.textContent = text("MIKELANDIA_CONTROLS.Boot.Continue", "Continue");
      if (mounted && root.classList.contains("is-failed") && recoveryCopy) showRecovery(recoveryCopy);
      else if (mounted && wakePromptVisible) headingText.textContent = text("MIKELANDIA_CONTROLS.Boot.LoadingComplete", "Loading Complete");
      else if (mounted && !root.classList.contains("is-complete")) {
        headingText.textContent = text("MIKELANDIA_CONTROLS.Boot.LoadingGame", "Loading your game");
      }
    },
    setWakeState(state = "pending", {
      checked = wake.getAttribute("aria-checked") === "true",
      disabled = false,
      visible = true
    } = {}) {
      wake.dataset.state = state;
      wake.setAttribute("aria-checked", String(Boolean(checked)));
      wake.disabled = Boolean(disabled);
      wake.hidden = wakePromptVisible || !visible;
    },
    setWakePromptChecked(checked) {
      wakePromptChoice.setAttribute("aria-checked", String(Boolean(checked)));
    },
    complete({ beforeDismiss } = {}) {
      heading.classList.remove("is-loading");
      return Promise.resolve(beforeDismiss?.()).then(() => {
        if (mounted) root.classList.add("is-complete");
        return mounted;
      });
    },
    promptForWakeChoice,
    resolveWakePrompt,
    showRecovery,
    fail(message = text("MIKELANDIA_CONTROLS.Boot.LoadFailed", "Mikelandia Controls could not finish loading.")) {
      showRecovery({ title: message });
    },
    unmount() {
      if (wakePromptWaiter) {
        wakePromptWaiter.resolve(null);
        wakePromptWaiter = null;
      }
      wakePrompt.hidden = true;
      wakePromptVisible = false;
      document.body?.classList.remove("mc-mobile-booting");
      root.remove();
      root.classList.remove("is-complete", "is-failed");
      mounted = false;
    }
  });
}
