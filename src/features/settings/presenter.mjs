import { icon, node } from "../../ui/primitives/dom.mjs";
import { localizedNumber, localizedText } from "../../ui/primitives/localized-text.mjs";

const uiText = (commands, key, fallback, data) =>
  localizedText(
    commands?.localize,
    `MIKELANDIA_CONTROLS.Settings.UI.${key}`,
    fallback,
    data,
  );

export function renderSettings({ commands, scope, overlayHost = null }) {
  const host = node("section", {
    attrs: {
      "data-mc-settings-presenter-builds": "1",
      "data-mc-settings-content-builds": "0",
    },
  });
  const accordionState = createSettingsAccordionState();
  let contentScope;
  let currentOverlayHost = overlayHost;
  let ownedOverlays = [];
  const syncOverlayHost = (nextHost) => {
    currentOverlayHost = nextHost;
    const destination = nextHost ?? host.querySelector(".mc-settings");
    const focused = host.ownerDocument?.activeElement;
    const restoreFocus = ownedOverlays.some((element) =>
      element.contains(focused),
    );
    if (destination)
      for (const element of ownedOverlays)
        if (element.parentNode !== destination) destination.append(element);
    if (restoreFocus && focused?.isConnected)
      focused.focus?.({ preventScroll: true });
  };
  host.syncOverlayHost = syncOverlayHost;
  const refresh = (requiresReload = false) => {
    if (scope.disposed) return;
    const scrollContainer = host.closest?.(".mc-viewport");
    const scrollTop = Number(scrollContainer?.scrollTop) || 0;
    const focusedId = host.ownerDocument?.activeElement?.id ?? "";
    contentScope?.dispose();
    contentScope = scope.child("settings-content");
    host.replaceChildren(
      settingsContent({
        commands,
        scope: contentScope,
        refresh,
        requiresReload,
        overlayHost: currentOverlayHost,
        accordionState,
        captureOverlays: (elements) => {
          ownedOverlays = elements;
        },
      }),
    );
    host.dataset.mcSettingsContentBuilds = String(
      Number(host.dataset.mcSettingsContentBuilds) + 1,
    );
    if (scrollContainer) scrollContainer.scrollTop = scrollTop;
    if (focusedId)
      host
        .querySelector?.(`#${safeId(focusedId)}`)
        ?.focus?.({ preventScroll: true });
  };
  refresh();
  return host;
}

function settingsContent({
  commands,
  scope,
  refresh,
  requiresReload,
  overlayHost,
  accordionState,
  captureOverlays,
}) {
  const preferences = commands.readSettings();
  const labels = preferences.labels ?? {};
  const status = node("div", {
    className: "mc-settings-status",
    attrs: { role: "status", "aria-live": "polite" },
  });
  const reloadPrompt = createReloadPrompt(commands, scope);
  const defaults = createDefaultsPrompt(commands, scope, refresh);
  const overlays = [reloadPrompt.element, defaults.element].filter(Boolean);
  captureOverlays(overlays);
  scope.own(() => {
    for (const element of overlays) element.remove();
  });
  if (overlayHost) overlayHost.replaceChildren(...overlays);
  if (requiresReload)
    reloadPrompt.show({
      name: uiText(commands, "DefaultSettings", "Default settings"),
    });
  const fields = [
    ...(preferences.fields ?? []),
    ...(preferences.performanceMode ? [preferences.performanceMode] : []),
  ];
  const groups = groupSettings(fields);
  const native = preferences.nativeSettings ?? {};
  return node("section", {
    className: "mc-settings",
    attrs: { "aria-label": uiText(commands, "Settings", "Settings") },
    children: [
      node("section", {
        className: "mc-settings-primary-section mc-settings-session",
        attrs: { "aria-labelledby": "mc-settings-session-title" },
        children: [
          node("header", {
            className:
              "mc-settings-primary-heading mc-settings-session-heading",
            children: [
              icon("fa-users"),
              node("h2", {
                text:
                  labels.sessionTitle ??
                  uiText(commands, "SessionTitle", "Session"),
                attrs: { id: "mc-settings-session-title" },
              }),
              logoutButton(preferences.logoutLabel, commands, status, scope),
            ],
          }),
          sessionStatusPanel(commands, scope, labels),
        ],
      }),
      node("div", {
        className: "mc-settings-divider",
        attrs: { "aria-hidden": "true" },
      }),
      node("section", {
        className: "mc-settings-primary-section mc-settings-foundry-section",
        attrs: { "aria-labelledby": "mc-foundry-settings-title" },
        children: [
          node("header", {
            className:
              "mc-settings-primary-heading mc-settings-foundry-heading",
            children: [
              icon("fa-gear"),
              node("h2", {
                text:
                  native.title ??
                  uiText(commands, "FoundrySettingsTitle", "Foundry Settings"),
                attrs: { id: "mc-foundry-settings-title" },
              }),
            ],
          }),
          foundrySettingsBlock(native, commands, status, scope),
        ],
      }),
      node("div", {
        className: "mc-settings-divider",
        attrs: { "aria-hidden": "true" },
      }),
      node("section", {
        className: "mc-settings-primary-section mc-settings-mobile-section",
        attrs: { "aria-labelledby": "mc-mobile-settings-title" },
        children: [
          node("header", {
            className: "mc-settings-primary-heading mc-settings-mobile-heading",
            children: [
              icon("fa-mobile-screen-button"),
              node("h2", {
                text:
                  labels.mobileSettingsTitle ??
                  uiText(commands, "MobileSettingsTitle", "MC Settings"),
                attrs: { id: "mc-mobile-settings-title" },
              }),
              defaults.button,
            ],
          }),
          node("div", {
            className: "mc-settings-groups",
            children: groups.map((group) => {
              const rowsFor = (groupFields) =>
                groupFields.flatMap((field) => {
                  const row = settingField(
                    field,
                    commands,
                    status,
                    scope,
                    reloadPrompt,
                    {
                      detail: null,
                      onSaved: null,
                    },
                  );
                  return [row];
                });
              let children = rowsFor(group.fields);
              if (group.id === "device")
                children.push(
                  node(
                    "button",
                    {
                      className: "mc-settings-controls-link",
                      attrs: { type: "button" },
                      children: [
                        icon("fa-hand-pointer"),
                        node("span", {
                          text: commands.localize(
                            "MIKELANDIA_CONTROLS.Controls.Title",
                          ),
                        }),
                      ],
                      on: {
                        click: (event) =>
                          commands.openControlsGuide(event.currentTarget),
                      },
                    },
                    scope,
                  ),
                );
              return settingsSection(
                group.id,
                localizedText(
                  commands.localize,
                  `MIKELANDIA_CONTROLS.Settings.UI.Group.${group.id}`,
                  group.title,
                ),
                children,
                scope,
                accordionState,
              );
            }),
          }),
        ],
      }),
      status,
      ...(overlayHost ? [] : overlays),
    ],
  });
}

function foundrySettingsBlock(native, commands, status, scope) {
  const action = nativeSettingsAction(
    {
      name:
        native.openFoundryLabel ??
        uiText(commands, "OpenFoundryLabel", "Open Foundry Settings"),
      hint:
        native.openFoundryHint ??
        uiText(
          commands,
          "OpenFoundryHint",
          "Use Foundry's native settings interface for core, system, and module configuration.",
        ),
      iconName: "fa-gears",
      action: () => commands.openFoundrySettings(),
    },
    status,
    scope,
    commands,
  );
  return node("section", {
    className: "mc-foundry-settings",
    attrs: { "aria-labelledby": "mc-foundry-settings-title" },
    children: [
      node("p", {
        text:
          native.openFoundryDescription ??
          uiText(
            commands,
            "OpenFoundryDescription",
            "Open core Foundry and module settings here.",
          ),
      }),
      node("p", {
        className: "mc-native-settings-compatibility-note",
        attrs: { role: "note" },
        children: [
          icon("fa-circle-info"),
          node("span", {
            text:
              native.compatibilityHint ??
              uiText(
                commands,
                "NativeSettingsCompatibility",
                "Some Foundry and module settings are designed for desktop and may not display correctly on smaller screens. If needed, switch to Desktop mode to access them.",
              ),
          }),
        ],
      }),
      action,
    ],
  });
}

function nativeSettingsAction(
  { name, hint, iconName, action },
  status,
  scope,
  commands,
) {
  const button = node("button", {
    className: "mc-setting-menu-button mc-button-accent-outline",
    attrs: { type: "button" },
    children: [
      icon(iconName),
      node("span", { text: name }),
      icon("fa-chevron-right"),
    ],
  });
  scope.listen(button, "click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = uiText(commands, "Opening", "Opening…");
    try {
      await action();
      status.textContent = "";
    } catch (error) {
      status.textContent =
        error?.message ??
        uiText(
          commands,
          "OpenNativeFailed",
          "That native settings window could not be opened.",
        );
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function sessionStatusPanel(commands, scope, labels) {
  const list = node("div", { className: "mc-session-status-list" });
  const update = (snapshot) =>
    list.replaceChildren(
      ...(snapshot?.users ?? []).map((user) =>
        node("div", {
          className: "mc-session-user",
          children: [
            node("span", {
              className: "mc-session-user-dot",
              attrs: {
                "aria-hidden": "true",
                style: `--mc-session-user-color:${user.color}`,
              },
            }),
            node("strong", { text: user.name }),
          ],
        }),
      ),
    );
  update(commands.readSessionStatus());
  commands.watchSessionStatus?.(scope, update);
  return node("div", {
    className: "mc-session-status",
    children: [
      node("span", {
        className: "mc-session-status-online",
        text: labels.online ?? uiText(commands, "Online", "Online"),
      }),
      list,
    ],
  });
}

export function groupSettings(fields) {
  const groups = [
    {
      id: "device",
      title: "Device & Power",
      keys: ["mode", "keepScreenAwake", "muteMobileAudio"],
    },
    {
      id: "actions",
      title: "Action Results",
      keys: ["showActionSummaries", "compactActionSummaries"],
    },
    {
      id: "appearance",
      title: "Appearance",
      keys: [
        "theme",
        "colorScheme",
        "headerArtwork",
        "headerArtworkOpacity",
        "protectMcStyling",
      ],
    },
    { id: "performance", title: "Dice", keys: ["diceRendering"] },
  ];
  const known = new Set(groups.flatMap((group) => group.keys));
  const result = groups
    .map((group) => ({
      ...group,
      fields: group.keys.flatMap((key) =>
        fields.filter((field) => field.key === key),
      ),
    }))
    .filter((group) => group.fields.length || group.always);
  const remaining = fields.filter((field) => !known.has(field.key));
  if (remaining.length)
    result.push({
      id: "additional",
      title: "Additional MC Settings",
      fields: remaining,
    });
  return result;
}

export function createSettingsAccordionState(initiallyOpen = []) {
  const open = new Set(initiallyOpen);
  return Object.freeze({
    isOpen: (id) => open.has(id),
    toggle(id) {
      if (open.has(id)) open.delete(id);
      else open.add(id);
      return open.has(id);
    },
  });
}

function settingsSection(id, title, children, scope, accordionState) {
  const headerId = `mc-settings-${safeId(id)}-header`;
  const bodyId = `mc-settings-${safeId(id)}-body`;
  const expanded = accordionState.isOpen(id);
  const body = node("div", {
    className: "mc-settings-group-body",
    attrs: { id: bodyId, hidden: !expanded },
    children,
  });
  const button = node("button", {
    className: "mc-settings-group-toggle",
    attrs: {
      id: headerId,
      type: "button",
      "aria-expanded": String(expanded),
      "aria-controls": bodyId,
    },
    children: [node("span", { text: title }), icon("fa-chevron-down")],
  });
  scope.listen(button, "click", () => {
    const next = accordionState.toggle(id);
    button.setAttribute("aria-expanded", String(next));
    body.hidden = !next;
  });
  return node("section", {
    className: "mc-settings-group",
    attrs: { "aria-labelledby": headerId },
    children: [node("h2", { children: [button] }), body],
  });
}

function createReloadPrompt(commands, scope) {
  const title = node("h2", {
    text: uiText(commands, "ReloadTitle", "Reload Mikelandia Controls?"),
  });
  const message = node("p", {
    text: uiText(
      commands,
      "FoundryReloadNeeded",
      "Foundry needs to reload before this setting can take effect.",
    ),
  });
  const later = node("button", {
    className: "mc-settings-reload-later",
    attrs: { type: "button" },
    text: uiText(commands, "NotNow", "Not now"),
  });
  const reload = node("button", {
    className: "mc-settings-reload-now",
    attrs: { type: "button" },
    children: [
      icon("fa-rotate"),
      node("span", { text: uiText(commands, "ReloadNow", "Reload now") }),
    ],
  });
  const element = node("div", {
    className: "mc-settings-reload",
    attrs: {
      hidden: true,
      role: "dialog",
      "aria-modal": "true",
      "aria-live": "assertive",
    },
    children: [
      node("section", {
        className: "mc-settings-reload-card",
        children: [
          icon("fa-arrows-rotate"),
          title,
          message,
          node("p", {
            className: "mc-settings-reload-note",
            text: uiText(
              commands,
              "ReloadNote",
              "Your choice has already been saved. You can reload later from your browser if you prefer.",
            ),
          }),
          node("div", {
            className: "mc-settings-reload-actions",
            children: [later, reload],
          }),
        ],
      }),
    ],
  });
  scope.listen(later, "click", () => element.setAttribute("hidden", ""));
  scope.listen(reload, "click", () => {
    reload.disabled = true;
    later.disabled = true;
    commands.reloadApplication();
  });
  return Object.freeze({
    element,
    show(field) {
      title.textContent = uiText(
        commands,
        "ReloadTitle",
        "Reload Mikelandia Controls?",
      );
      message.textContent = uiText(
        commands,
        "ReloadMessage",
        "{name} has been saved. Reload to apply it.",
        { name: field.name },
      );
      reload.disabled = false;
      later.disabled = false;
      element.removeAttribute("hidden");
      reload.focus({ preventScroll: true });
    },
  });
}

function logoutButton(label, commands, status, scope) {
  const button = node("button", {
    className: "mc-settings-logout",
    attrs: { type: "button" },
    children: [
      icon("fa-right-from-bracket"),
      node("span", {
        children: [
          node("strong", {
            text: friendlyLabel(
              label,
              localizedText(commands.localize, "MENU.Logout", "Log out"),
            ),
          }),
        ],
      }),
      icon("fa-chevron-right"),
    ],
  });
  scope.listen(button, "click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = uiText(commands, "LoggingOut", "Logging out…");
    try {
      await commands.logout();
    } catch (error) {
      button.disabled = false;
      status.textContent =
        error?.message ??
        uiText(commands, "LogoutFailed", "Foundry could not log out.");
    }
  });
  return button;
}

function settingField(
  field,
  commands,
  status,
  scope,
  reloadPrompt,
  { detail = null, onSaved = null } = {},
) {
  const controlId = `mc-setting-${safeId(field.namespace)}-${safeId(field.key)}`;
  const hintId = `${controlId}-hint`;
  const control = settingControl(field, controlId, commands);
  if (
    field.key === "compactActionSummaries" &&
    commands.readActionSummaryPreferences?.().showActionSummaries === false
  )
    control.disabled = true;
  const suffix = field.suffix
    ? node("span", {
        text:
          field.type === "range"
            ? rangeLabel(
                field.value,
                field.suffix,
                field.step,
                commands.readLocale?.() ?? "en",
              )
            : field.suffix,
      })
    : null;
  const hint =
    field.supported === false
      ? `${field.hint} ${field.unsupported}`
      : field.hint;
  if (hint) control.setAttribute("aria-describedby", hintId);
  let currentValue = field.value;
  let submittedValue = settingValueKey(currentValue);
  const save = async (requestedValue) => {
    const value =
      requestedValue === undefined
        ? controlValue(control, field.type)
        : requestedValue;
    const valueKey = settingValueKey(value);
    if (valueKey === submittedValue) return;
    const previous = currentValue;
    submittedValue = valueKey;
    control.disabled = true;
    status.textContent = uiText(commands, "Saving", "Saving…");
    try {
      const wakeRequest =
        field.wakeLock && value ? commands.requestScreenWakeLock() : null;
      const result = await commands.updateSetting({
        namespace: field.namespace,
        key: field.key,
        value,
      });
      if (wakeRequest && !(await wakeRequest)) {
        await commands.updateSetting({
          namespace: field.namespace,
          key: field.key,
          value: false,
        });
        throw new Error(
          field.failure ??
            uiText(
              commands,
              "WakeLockFailed",
              "This browser did not grant the screen wake lock.",
            ),
        );
      }
      if (field.key === "showActionSummaries") {
        const dependent = control
          .closest(".mc-settings")
          ?.querySelector('[id="mc-setting-mc-mobile-compactActionSummaries"]');
        if (dependent) dependent.disabled = result.value === false;
      }
      currentValue = result.value;
      submittedValue = settingValueKey(currentValue);
      setControlValue(control, field.type, currentValue);
      if (suffix && field.type === "range")
        suffix.textContent = rangeLabel(
          currentValue,
          field.suffix,
          field.step,
          commands.readLocale?.() ?? "en",
        );
      if (result.requiresReload) {
        status.textContent = uiText(commands, "Saved", "Saved");
        reloadPrompt.show(field);
      } else status.textContent = uiText(commands, "Saved", "Saved");
      onSaved?.(result);
      scope.timeout(() => {
        if (status.textContent.startsWith(uiText(commands, "Saved", "Saved")))
          status.textContent = "";
      }, 1600);
    } catch (error) {
      submittedValue = settingValueKey(previous);
      setControlValue(control, field.type, previous);
      if (suffix && field.type === "range")
        suffix.textContent = rangeLabel(
          previous,
          field.suffix,
          field.step,
          commands.readLocale?.() ?? "en",
        );
      status.textContent =
        error?.message ??
        uiText(
          commands,
          "SaveSettingFailed",
          "That setting could not be saved.",
        );
    } finally {
      control.disabled =
        field.supported === false ||
        (field.key === "compactActionSummaries" &&
          commands.readActionSummaryPreferences?.().showActionSummaries ===
            false);
    }
  };
  scope.listen(control, "change", () => save());
  if (field.type === "range" && suffix) {
    scope.listen(control, "input", () => {
      suffix.textContent = rangeLabel(
        control.value,
        field.suffix,
        field.step,
        commands.readLocale?.() ?? "en",
      );
    });
  }
  return node("div", {
    className: `mc-setting mc-setting-${field.type}`,
    children: [
      settingCopy({ ...field, hint }, controlId, hintId, detail, commands),
      node("div", {
        className: "mc-setting-control",
        children: [control, suffix],
      }),
    ],
  });
}

function defaultLabel(field, commands) {
  if (field.type === "choice")
    return (
      field.choices.find(
        (choice) => String(choice.value) === String(field.defaultValue),
      )?.label ?? String(field.defaultValue)
    );
  if (field.type === "boolean")
    return field.defaultValue
      ? uiText(commands, "On", "On")
      : uiText(commands, "Off", "Off");
  if (field.type === "range")
    return rangeLabel(
      field.defaultValue,
      field.suffix,
      field.step,
      commands.readLocale?.() ?? "en",
    );
  return String(field.defaultValue);
}

function createDefaultsPrompt(commands, scope, refresh) {
  const button = node("button", {
    className: "mc-settings-defaults",
    attrs: { type: "button" },
    text: uiText(commands, "RestoreDefaults", "Restore Defaults"),
  });
  const cancel = node("button", {
    className: "mc-settings-reload-later",
    attrs: { type: "button" },
    text: uiText(commands, "Cancel", "Cancel"),
  });
  const confirm = node("button", {
    className: "mc-settings-reload-now",
    attrs: { type: "button" },
    text: uiText(commands, "RestoreDefaults", "Restore Defaults"),
  });
  const feedback = node("p", {
    attrs: { role: "status", "aria-live": "polite" },
  });
  const element = node("div", {
    className: "mc-settings-reload",
    attrs: {
      hidden: true,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": uiText(
        commands,
        "RestoreDefaultsLabel",
        "Restore default settings",
      ),
    },
    children: [
      node("section", {
        className: "mc-settings-reload-card",
        children: [
          icon("fa-rotate-left"),
          node("h2", {
            text: uiText(
              commands,
              "RestoreDefaultsTitle",
              "Restore default settings?",
            ),
          }),
          node("p", {
            text: uiText(
              commands,
              "RestoreDefaultsMessage",
              "Reset every setting listed on this tab to its default for this browser? A reload may be needed. Auto-detect may return this device to the desktop interface.",
            ),
          }),
          feedback,
          node("div", {
            className: "mc-settings-reload-actions",
            children: [cancel, confirm],
          }),
        ],
      }),
    ],
  });
  scope.listen(button, "click", () => {
    element.hidden = false;
    cancel.focus({ preventScroll: true });
  });
  scope.listen(cancel, "click", () => {
    element.hidden = true;
    button.focus({ preventScroll: true });
  });
  scope.listen(confirm, "click", async () => {
    if (confirm.disabled) return;
    confirm.disabled = cancel.disabled = true;
    feedback.textContent = uiText(
      commands,
      "RestoringDefaults",
      "Restoring defaults…",
    );
    try {
      const result = await commands.restoreSettingsDefaults();
      refresh(result.requiresReload);
    } catch (error) {
      feedback.textContent =
        error?.message ??
        uiText(
          commands,
          "RestoreDefaultsFailed",
          "Some settings could not be restored. Please try again.",
        );
      confirm.disabled = cancel.disabled = false;
    }
  });
  return { button, element };
}

function settingCopy(entry, controlId, hintId, detail = null, commands) {
  return node("div", {
    className: "mc-setting-copy",
    children: [
      node(controlId ? "label" : "div", {
        className: "mc-setting-name",
        text: entry.name,
        attrs: { for: controlId },
      }),
      entry.hint
        ? node("p", {
            attrs: hintId ? { id: hintId } : {},
            text:
              entry.hint +
              (entry.defaultValue !== undefined
                ? ` (${uiText(commands, "Default", "Default: {value}.", { value: defaultLabel(entry, commands) })})`
                : ""),
          })
        : null,
      detail,
      entry.requiresReload || (entry.scope && entry.scope !== "client")
        ? node("div", {
            className: "mc-setting-meta",
            children: [
              entry.scope && entry.scope !== "client"
                ? node("span", {
                    text:
                      entry.scope === "world"
                        ? uiText(commands, "World", "World")
                        : uiText(commands, "User", "User"),
                  })
                : null,
              entry.requiresReload
                ? node("span", {
                    text: uiText(commands, "ReloadRequired", "Reload required"),
                  })
                : null,
            ],
          })
        : null,
    ],
  });
}

function settingControl(field, id, commands) {
  if (field.type === "unsupported") {
    return node("span", {
      className: "mc-setting-unavailable",
      text: uiText(commands, "NotEditableHere", "Not editable here"),
    });
  }
  if (field.type === "choice") {
    const select = node("select", {
      className: "mc-setting-select",
      attrs: {
        id,
        "aria-label": field.name,
        disabled: field.supported === false,
      },
      children: field.choices.map((choice) =>
        node("option", {
          text: choice.label,
          attrs: {
            value: choice.value,
            selected: String(choice.value) === String(field.value),
          },
        }),
      ),
    });
    select.value = String(field.value);
    return select;
  }
  if (field.type === "range") {
    const range = node("input", {
      attrs: {
        id,
        type: "range",
        value: field.value,
        min: field.min,
        max: field.max,
        step: field.step,
        "aria-label": field.name,
      },
    });
    range.value = String(field.value);
    return range;
  }
  if (field.type === "boolean") {
    return settingsToggle({
      id,
      "aria-label": field.name,
      checked: field.value,
      disabled: field.supported === false,
    });
  }
  return node("input", {
    className: `mc-setting-input mc-setting-input-${field.type}`,
    attrs: {
      id,
      type:
        field.type === "number" || field.type === "color" ? field.type : "text",
      value: field.value,
      min: field.min,
      max: field.max,
      step: field.step,
      "aria-label": field.name,
      autocomplete: "off",
      disabled: field.supported === false,
    },
  });
}

function settingsToggle(attrs) {
  return node("input", {
    className: "mc-setting-toggle",
    attrs: { type: "checkbox", role: "switch", ...attrs },
  });
}

function controlValue(control, type) {
  if (type === "boolean") return Boolean(control.checked);
  if (type === "range" || type === "number") return Number(control.value);
  return control.value;
}

function setControlValue(control, type, value) {
  if (type === "boolean") control.checked = Boolean(value);
  else control.value = String(value);
}

function settingValueKey(value) {
  return `${typeof value}:${String(value)}`;
}

function rangeLabel(value, suffix, step = 1, locale = "en") {
  if (suffix === "%")
    return `${localizedNumber(Math.round(Number(value) * 100), locale)}%`;
  const decimals = String(step).split(".")[1]?.length ?? 0;
  return `${localizedNumber(Number(value), locale, decimals)} ${suffix}`;
}

function safeId(value) {
  return String(value ?? "setting").replace(/[^a-z0-9_-]+/giu, "-");
}

function friendlyLabel(value, fallback) {
  const label = String(value ?? "").trim();
  return !label || /^[A-Z0-9_.-]+$/u.test(label) ? fallback : label;
}
