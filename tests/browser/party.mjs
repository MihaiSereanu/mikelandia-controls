import { createActor, collection } from "/tests/helpers/foundry.mjs";
import { createShadowdarkFixture } from "/tests/helpers/shadowdark.mjs";
import { createWarhammerActor, addWarhammerConditions } from "/tests/helpers/warhammer.mjs";

export async function checkParty({ f, store, uiCommands, root, check, tick, params }) {
  const shadowdark = game.system.id === "shadowdark";
  const avatar = color => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/><circle cx="32" cy="24" r="12" fill="#e8cfb0"/><path d="M10 64Q10 39 32 39Q54 39 54 64" fill="#d6b765"/></svg>`)}`;
  f.actor.img = avatar("#3a5147");
  game.user.isGM = false;
  if (params.has("large")) document.documentElement.style.fontSize = "22px";
  if (params.has("unprotected")) {
    await uiCommands.updateSetting({ namespace: "mikelandia-controls", key: "protectMcStyling", value: false });
  }
  const physical = { isPhysical: true, isIdentified: true, stashed: false, quantity: 3, slots: { per_slot: 3, slots_used: 1 } };
  const addSupplies = actor => {
    actor.items.push(...[["rations", "Rations", 3], ["water", "Waterskin", 2], ["stash", "Rations", 10]].map(([id, name, quantity]) => ({
      id, name, type: "Basic", parent: actor, uuid: `${actor.uuid}.Item.${id}`, isOwner: actor.isOwner,
      system: { ...physical, quantity, stashed: id === "stash" }
    })));
    actor.system.slots = 10;
    actor.system.getSlotUsage = () => ({ total: actor.items.reduce((total, item) => total + (item.system?.isPhysical && !item.system.stashed ? item.system.quantity : 0), 0) });
  };
  const observer = shadowdark ? createActor({ type: "Player" }) : createWarhammerActor();
  observer.id = "observer"; observer.uuid = "Actor.observer";
  observer.name = "Alma of the Long and Winding Road";
  observer.img = avatar("#514356");
  observer.isOwner = false;
  let permitted = true;
  observer.testUserPermission = (_user, level) => permitted && level === "OBSERVER";
  observer.items = collection([]);
  const owned = shadowdark ? createShadowdarkFixture().actor : createWarhammerActor();
  owned.img = "";
  owned.id = "second"; owned.uuid = "Actor.second"; owned.name = "Bryn";
  for (const item of owned.items) { item.parent = owned; item.uuid = `${owned.uuid}.Item.${item.id}`; }
  if (shadowdark) {
    addSupplies(f.actor); addSupplies(observer); addSupplies(owned);
    const write = owned.updateEmbeddedDocuments;
    owned.updateEmbeddedDocuments = async (...args) => {
      const result = await write(...args);
      for (const update of args[1]) f.hooks.emit("updateItem", owned.items.get(update._id), update);
      return result;
    };
  } else {
    for (const actor of [f.actor, observer, owned]) {
      addWarhammerConditions(actor, game, f.hooks);
      await actor.addCondition("bleeding", 2);
      await actor.addCondition("prone", 1);
      actor.items.push({ id: "injury", type: "injury", name: "Torn muscle", parent: actor, isOwner: actor.isOwner },
        { id: "critical", type: "critical", name: "Broken arm", parent: actor, isOwner: actor.isOwner });
    }
  }
  const denied = createActor({ id: "denied", uuid: "Actor.denied", name: "Secret PC", type: shadowdark ? "Player" : "character", testUserPermission: () => false });
  game.actors.push(observer, owned, denied, createActor({ id: "npc", type: shadowdark ? "NPC" : "creature", name: "Non-PC" }));
  if (shadowdark) game.actors.push(createActor({ id: "group", type: "Player", name: "Group" }));
  f.hooks.emit("createActor", observer); f.hooks.emit("createActor", owned); await tick();
  const originalSelection = store.state.selectedActorSourceUuid;
  root.querySelector('[data-route="party"]').click(); await tick();
  check("Party appears immediately after Character", [...root.querySelectorAll(".mc-main-nav-item")].filter(button => !button.hidden).map(button => button.dataset.route).join(",") === "characters,party,chat,journals,combat,settings");
  check("Party navigation opens its screen", store.state.route === "party" && !!root.querySelector(".mc-party-screen"));
  check("Party roster includes Observer PCs alphabetically", [...root.querySelectorAll("[data-party-actor] h2")].map(node => node.textContent).join(",") === `${observer.name},Bryn,${f.actor.name}`);
  check("Party excludes denied PCs, NPCs and Group", !root.querySelector(".mc-party-screen").textContent.match(/Secret PC|Non-PC|Group/));
  check("Party shows portraits next to names and a missing-portrait fallback", root.querySelectorAll(".mc-party-roster .mc-party-identity img").length === 2
    && !!root.querySelector('[data-party-actor="second"] .mc-party-portrait .fa-user'));
  observer.img = avatar("#596171"); f.hooks.emit("updateActor", observer, { img: observer.img }); await tick();
  check("Party portraits refresh with actor updates", root.querySelector('[data-party-actor="observer"] img').getAttribute("src") === observer.img);
  check("Party retains Character selection", store.state.selectedActorSourceUuid === originalSelection);
  const health = shadowdark ? observer.system.attributes.hp : observer.system.status.wounds;
  health.max = 20; health.value = 10;
  f.hooks.emit("updateActor", observer, {}); await tick();
  check("Observer HP updates live with Bloodied qualifier", root.querySelector('[data-party-actor="observer"] .mc-party-health').textContent.includes("10 / 20")
    && root.querySelector('[data-party-actor="observer"] .mc-party-health-status').textContent === "Bloodied");
  if (shadowdark) {
    const observerCard = () => root.querySelector('[data-party-supplies-actor="observer"]');
    const ownedCard = () => root.querySelector('[data-party-supplies-actor="second"]');
    check("Observer supplies are readable with no edit controls", observerCard().textContent.includes("Waterskin") && observerCard().querySelectorAll("button").length === 0);
    check("Supplies also shows portraits next to PC names", !!observerCard().querySelector(".mc-party-identity img"));
    const savedName = observer.name;
    observer.name = `${savedName} ${"with an exceptionally long name ".repeat(8)}`;
    f.hooks.emit("updateActor", observer, { name: observer.name }); await tick();
    const header = observerCard().querySelector(".mc-party-supply-header");
    const name = header.querySelector("h3"), slots = header.querySelector(".mc-party-slots");
    const nameBounds = name.getBoundingClientRect(), slotsBounds = slots.getBoundingClientRect();
    check("Supplies name and Gear Slots share one row", Math.abs((nameBounds.top + nameBounds.bottom) / 2 - (slotsBounds.top + slotsBounds.bottom) / 2) < 2);
    check("Long supply names use an ellipsis and preserve the full name", name.scrollWidth > name.clientWidth && getComputedStyle(name).textOverflow === "ellipsis"
      && getComputedStyle(name).whiteSpace === "nowrap" && name.title === observer.name);
    check("Gear Slots never wraps or overlaps the name", getComputedStyle(slots).whiteSpace === "nowrap" && nameBounds.right <= slotsBounds.left
      && header.scrollWidth <= header.clientWidth + 1 && slotsBounds.right <= observerCard().getBoundingClientRect().right);
    observer.name = savedName;
    f.hooks.emit("updateActor", observer, { name: savedName }); await tick();
    check("Stashed supplies are omitted", observerCard().querySelectorAll("[data-party-item]").length === 2);
    check("Owner supply controls work independently of Character selection", !!ownedCard().querySelector('[data-profile-edit="quantity:rations"]'));
    const buttons = [...ownedCard().querySelector('[data-party-item="rations"]').querySelectorAll("button")].map(button => button.getBoundingClientRect());
    check("Supply quantity controls fit one row with touch targets", buttons.length === 3 && buttons.every(button => button.width >= 44 && button.height >= 44 && Math.abs(button.top - buttons[0].top) < 2));
    ownedCard().querySelector('[data-party-item="rations"] [data-profile-quantity-delta="1"]').click(); await tick();
    check("Party edits the requested owned PC only", owned.items.get("rations").system.quantity === 4
      && f.actor.items.get("rations").system.quantity === 3 && store.state.selectedActorSourceUuid === originalSelection);
    ownedCard().querySelector('[data-profile-edit="quantity:water"]').click();
    const input = ownedCard().querySelector("input"); input.value = "6"; input.dispatchEvent(new Event("input"));
    health.value = 2; f.hooks.emit("updateActor", observer, {}); await tick();
    check("Unrelated health updates retain the supply draft and focus", ownedCard().querySelector("input") === input && input.value === "6" && document.activeElement === input);
    input.closest("form").requestSubmit(); await tick();
    check("Party quantity editor saves through native inventory", owned.items.get("water").system.quantity === 6);
    const previous = owned.items.get("rations").system.quantity;
    ownedCard().querySelector('[data-profile-edit="quantity:rations"]').click();
    const staleInput = ownedCard().querySelector("input"); staleInput.value = "9";
    owned.testUserPermission = (_user, level) => level === "OBSERVER";
    staleInput.closest("form").requestSubmit(); await tick();
    check("Ownership revocation rejects an open supply edit", owned.items.get("rations").system.quantity === previous);
    f.hooks.emit("updateActor", owned, { ownership: {} }); await tick();
    check("Revoked owner controls become read-only", ownedCard().querySelectorAll("button").length === 0);
  } else {
    check("WFRP shows Conditions with values, Injuries and Critical Wounds", [...root.querySelectorAll("[data-party-actor]")].every(card =>
      card.textContent.includes("Bleeding 2") && card.textContent.includes("Prone") && card.textContent.includes("Torn muscle") && card.textContent.includes("Broken arm")));
    check("WFRP Party has no mutation controls or Supplies region", root.querySelectorAll(".mc-party-screen [data-profile-action], .mc-party-screen .mc-profile-condition-controls, .mc-party-screen input").length === 0 && getComputedStyle(root.querySelector(".mc-party-supplies")).display === "none");
    if (params.get("edition") !== "4e") {
      const trigger = root.querySelector('[data-party-actor="observer"] [data-party-condition="bleeding"]');
      const effectsBefore = JSON.stringify(observer.effects.map(effect => [effect.conditionId, effect.conditionValue]));
      trigger.click(); await tick();
      const tooltip = document.getElementById(trigger.getAttribute("aria-describedby"));
      check("Observer condition names open read-only tooltips", tooltip.matches(":popover-open") && trigger.getAttribute("aria-expanded") === "true");
      check("Condition tooltips use the existing 5e rules", tooltip.textContent.includes("Challenging"));
      trigger.click(); await tick();
      check("Retapping the condition dismisses its tooltip without mutation", !tooltip.matches(":popover-open") && JSON.stringify(observer.effects.map(effect => [effect.conditionId, effect.conditionValue])) === effectsBefore);
    } else {
      check("4e conditions retain plain labels", !root.querySelector("[data-party-condition]"));
    }
    await observer.removeCondition("bleeding", 2); await tick();
    check("WFRP conditions refresh for observer PCs", !root.querySelector('[data-party-actor="observer"]').textContent.includes("Bleeding"));
  }
  permitted = false; f.hooks.emit("updateActor", observer, { ownership: {} }); await tick();
  check("Observer revocation removes the PC immediately", !root.querySelector('[data-party-actor="observer"]') && !root.querySelector('[data-party-supplies-actor="observer"]'));
  permitted = true; f.hooks.emit("updateActor", observer, { ownership: {} }); await tick();
  const viewport = root.querySelector(".mc-viewport");
  viewport.scrollTop = 40;
  const scroll = viewport.scrollTop;
  health.value = 0; f.hooks.emit("updateActor", observer, {}); await tick();
  check("Party preserves reading position during health updates", Math.abs(viewport.scrollTop - scroll) < 2);
  check("Zero health is Critical", root.querySelector('[data-party-actor="observer"] .mc-party-health-status').textContent === "Critical");
  check("Party content fits the viewport width", viewport.scrollWidth <= viewport.clientWidth + 1);
  const nav = root.querySelector(".mc-bottom-nav"), rect = nav.getBoundingClientRect();
  check("Six navigation routes fit the viewport", rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1
    && (rect.height > rect.width || getComputedStyle(nav).gridTemplateColumns.split(" ").length === 6));
  root.querySelector('[data-route="characters"]').click(); await tick();
  let outsidePartyRejected = false;
  try { await uiCommands.editPartySupply({ actorSourceUuid: f.actor.uuid }); } catch { outsidePartyRejected = true; }
  check("Party supply actions reject calls outside the Party route", outsidePartyRejected);
  check("Character remains available with its original selection", store.state.route === "characters" && store.state.selectedActorSourceUuid === originalSelection);
  root.querySelector('[data-route="party"]').click(); await tick();
  await tick();
  viewport.scrollTop = 0;
  if (params.has("supplies")) {
    root.querySelector(`[data-party-supplies-actor="${f.actor.id}"]`).scrollIntoView({ block: "center" });
    root.querySelector(`[data-party-supplies-actor="${f.actor.id}"] [data-profile-edit="quantity:rations"]`).click();
    await tick();
    check("Open supply editor fits viewport width", viewport.scrollWidth <= viewport.clientWidth + 1);
  }
}
