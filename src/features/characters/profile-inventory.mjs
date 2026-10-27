import { node, icon } from "../../ui/dom.mjs";
import { localizedText } from "../../ui/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";

/** The integration supplies catalog data; the UI never reads native documents. */
export function renderProfileInventory(actor, commands, scope) {
  const text = (key, fallback) => localizedText(commands.localize, `VEMOBILE.Inventory.${key}`, fallback);
  const body = node("div", { className: "ve-profile-inventory-body ve-profile-inventory-tools" });
  const open = node("button", { className: "ve-profile-add-item", children: [icon("fa-plus")], attrs: { type: "button", "aria-label": text("AddItem", "Add item"), title: text("AddItem", "Add item"), "data-profile-add-item": true }, on: { click: () => {
    if (scope.disposed || open.disabled || open.hidden) return;
    open.hidden = true;
    const formScope = scope.child("inventory-editor");
    const close = () => {
      formScope.dispose(); body.replaceChildren(); open.hidden = false;
      if (open.isConnected) open.focus({ preventScroll: true });
    };
    const showEditor = mode => {
      const message = node("p", { attrs: { role: "status" } });
      let busy = false;
      const controls = () => body.querySelectorAll("button, input, select");
      const run = async payload => {
        if (busy || formScope.disposed) return;
        busy = true; for (const control of controls()) control.disabled = true;
        try {
          const result = await commands.execute(ACTOR_COMMANDS.ADD_PROFILE_ITEM, { actorSourceUuid: actor.sourceUuid, ...payload });
          if (!formScope.disposed && !result?.cancelled) close();
        } catch (error) { if (!formScope.disposed) commands.reportCharacterMutationError?.(error); }
        finally { busy = false; if (!formScope.disposed) for (const control of controls()) control.disabled = false; }
      };
      const cancel = node("button", { text: text("Cancel", "Cancel"), attrs: { type: "button", "data-profile-inventory-cancel": true }, on: { click: close } }, formScope);
      if (mode === "custom") {
        const name = node("input", { attrs: { type: "text", required: true, maxlength: 200, "aria-label": text("Name", "Item name") } });
        const weightInput = (id, label, min) => {
          const input = node("input", { attrs: { type: "text", inputmode: "numeric", pattern: "[0-9]*", required: true, value: 1,
            "aria-label": label, "data-profile-custom-weight": id } });
          const validate = () => input.setCustomValidity(/^\d+$/u.test(input.value) && Number.isSafeInteger(Number(input.value)) && Number(input.value) >= min
            ? "" : text("InvalidSlots", "Use whole numbers: slots at least 0 and per quantity at least 1."));
          formScope.listen(input, "input", validate);
          return { input, validate, label: node("label", { children: [label, input] }) };
        };
        const slots = weightInput("slotsUsed", text("SlotsUsed", "Slots used"), 0);
        const per = weightInput("perQuantity", text("PerQuantity", "Per quantity"), 1);
        const form = node("form", { className: "ve-profile-custom-item", children: [
          node("label", { children: [text("Name", "Item name"), name] }),
          slots.label, per.label,
          node("button", { text: text("Create", "Create item"), attrs: { type: "submit" } })
        ], on: { submit: event => {
          event.preventDefault(); slots.validate(); per.validate();
          if (form.reportValidity()) void run({ name: name.value, slotsUsed: Number(slots.input.value), perQuantity: Number(per.input.value) });
        } } }, formScope);
        body.replaceChildren(node("h4", { text: text("Custom", "Create custom item") }), form, cancel);
        name.focus();
        return;
      }
      const search = node("input", { attrs: { type: "search", placeholder: text("Search", "Search gear"), "aria-label": text("Search", "Search gear") } });
      const catalogRows = node("div", { className: "ve-profile-catalog-results", attrs: { tabindex: "0", "aria-label": text("Catalog", "Catalog") } });
      let catalog = [], resultsScope, loaded = false, unavailable = false;
      const normalize = value => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
      const renderResults = () => {
        if (!loaded || formScope.disposed) return;
        resultsScope?.dispose(); resultsScope = formScope.child("catalog-results");
        const tokens = normalize(search.value).trim().split(/\s+/u).filter(Boolean);
        const matches = catalog.filter(item => {
          const haystack = normalize(`${item.name} ${item.source}`);
          return tokens.every(token => haystack.includes(token));
        });
        catalogRows.replaceChildren(...matches.map(item => node("button", {
          text: `${item.name} \u00b7 ${item.source}`, attrs: { type: "button", "data-profile-catalog-item": item.uuid },
          on: { click: () => void run({ itemUuid: item.uuid }) }
        }, resultsScope)));
        catalogRows.scrollTop = 0;
        message.textContent = matches.length ? `${matches.length} ${text("Matches", "matching items")}` : text("NoItems", "No matching gear.");
        if (unavailable) message.textContent += ` ${text("Unavailable", "Some catalogs could not be loaded.")}`;
      };
      formScope.listen(search, "input", renderResults);
      const retry = node("button", { text: text("Retry", "Retry catalog"), attrs: { type: "button", hidden: true }, on: { click: () => void load() } }, formScope);
      const load = async () => {
        retry.hidden = true;
        message.textContent = text("Loading", "Loading gear\u2026");
        try {
          const result = await commands.execute(ACTOR_COMMANDS.LIST_PROFILE_ITEMS, { actorSourceUuid: actor.sourceUuid });
          if (formScope.disposed) return;
          catalog = result.items; loaded = true; unavailable = !!result.unavailable?.length; renderResults();
        } catch (error) {
          if (formScope.disposed) return;
          message.textContent = text("LoadFailed", "Could not load the catalog. Try again.");
          retry.hidden = false;
          commands.reportCharacterMutationError?.(error);
        }
      };
      body.replaceChildren(node("h4", { text: text("Catalog", "Catalog") }), search, message, retry, catalogRows, cancel);
      search.focus();
      void load();
    };
    const chooserScope = formScope.child("inventory-choice");
    let chooser;
    const choose = mode => { chooserScope.dispose(); showEditor(mode); };
    const choices = [
      node("button", { text: text("Custom", "Create custom item"), attrs: { type: "button", "data-profile-item-mode": "custom" }, on: { click: () => choose("custom") } }, chooserScope),
      node("button", { text: text("SearchCatalog", "Search catalog"), attrs: { type: "button", "data-profile-item-mode": "catalog" }, on: { click: () => choose("catalog") } }, chooserScope),
      node("button", { text: text("Cancel", "Cancel"), attrs: { type: "button" }, on: { click: close } }, chooserScope)
    ];
    chooser = node("div", { className: "ve-profile-inventory-choice", attrs: { role: "dialog", "aria-modal": "true", "aria-label": text("AddItem", "Add item"), "data-ve-back-kind": "inventory-choice", "data-ve-back-dismissable": "true" }, children: [
      node("section", { className: "ve-profile-inventory-choice-card", children: [node("h2", { text: text("AddItem", "Add item") }), ...choices] })
    ] });
    chooserScope.listen(chooser, "ve-close", close);
    chooserScope.listen(chooser, "keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      event.preventDefault();
      const index = choices.indexOf(document.activeElement);
      choices[(index + (event.shiftKey ? -1 : 1) + choices.length) % choices.length].focus();
    });
    chooserScope.own(() => chooser.remove());
    (open.closest(".ve-mobile-app") ?? body).append(chooser);
    choices[0].focus();
  } } }, scope);
  return { button: open, body };
}
