import { node, icon } from "../../ui/primitives/dom.mjs";
import { localizedText } from "../../ui/primitives/localized-text.mjs";
import { renderProfileResourceEditor } from "../characters/profile/profile-resource-editor.mjs";
import { renderProfileTooltip } from "../characters/profile/profile-tooltip.mjs";

export function renderParty({ state, commands, scope }) {
  const text = (key, fallback) => localizedText(commands.localize, `MIKELANDIA_CONTROLS.Party.${key}`, fallback);
  const roster = node("div", { className: "mc-party-roster" });
  const supplies = node("section", { className: "mc-party-supplies" });
  const screen = node("section", { className: "mc-party-screen", children: [
    node("h1", { text: text("Title", "Party") }), roster, supplies
  ] });
  let rosterKey = "", suppliesKey = "", suppliesScope, rosterScope;
  screen.updateParty = party => {
    const members = party?.members ?? [];
    const nextRosterKey = JSON.stringify(members.map(({ id, name, img, health, conditions, injuries }) => ({ id, name, img, health, conditions, injuries })));
    if (nextRosterKey !== rosterKey) {
      rosterKey = nextRosterKey;
      rosterScope?.dispose();
      rosterScope = scope.child("party-roster");
      roster.replaceChildren(...members.map(member => {
        const health = member.health;
        const details = [];
        if (member.conditions) {
          details.push(node("div", { className: "mc-party-conditions", children: [
            node("strong", { text: `${text("Conditions", "Conditions")}: ` }),
            ...(member.conditions.length ? member.conditions.map(condition => conditionReference(member, condition)) : [text("None", "None")])
          ] }));
          for (const [type, key, label] of [["injury", "Injuries", "Injuries"], ["critical", "CriticalWounds", "Critical Wounds"]]) {
            details.push(detail(key, label, member.injuries.filter(item => item.type === type).map(item => item.name)));
          }
        }
        return node("article", { className: "mc-party-member", dataset: { partyActor: member.id }, children: [
          node("div", { className: "mc-party-identity", children: [portrait(member, rosterScope), node("h2", { text: member.name })] }),
          node("p", { className: "mc-party-health", dataset: { health: health?.status?.toLowerCase() ?? "unknown" }, children: [
            node("span", { text: health ? `${localizedText(commands.localize, health.labelKey, health.label)} ${health.value} / ${health.max}` : text("HealthUnavailable", "Health unavailable") }),
            health ? node("span", { className: "mc-party-health-status", text: localizedText(commands.localize, `MIKELANDIA_CONTROLS.Targets.${health.status}`, health.status) }) : null
          ] }), ...details
        ] });
      }));
      if (!members.length) roster.append(node("p", { className: "mc-party-empty", text: text("Empty", "No PCs available with Observer access.") }));
    }
    supplies.hidden = !party?.supplies || !members.length;
    const nextSuppliesKey = JSON.stringify([party?.supplies, members.map(({ id, sourceUuid, name, img, slots, supplies }) => ({ id, sourceUuid, name, img, slots, supplies }))]);
    if (nextSuppliesKey === suppliesKey) return;
    suppliesKey = nextSuppliesKey;
    suppliesScope?.dispose();
    suppliesScope = scope.child("party-supplies");
    supplies.replaceChildren(node("h2", { text: text("Supplies", "Supplies") }));
    if (!party?.supplies) return;
    const supplyCommands = { ...commands, execute: (_name, payload) => commands.editPartySupply(payload) };
    for (const member of members) {
      const card = node("article", { className: "mc-party-member", dataset: { partySuppliesActor: member.id }, children: [
        node("div", { className: "mc-party-supply-header", children: [
          node("div", { className: "mc-party-identity", children: [portrait(member, suppliesScope), node("h3", { text: member.name, attrs: { title: member.name } })] }),
          node("p", { className: "mc-party-slots", dataset: { overCapacity: String(Boolean(member.slots && member.slots.used > member.slots.max)) },
            text: `${text("GearSlots", "Gear Slots")}: ${member.slots ? `${member.slots.used} / ${member.slots.max}` : "—"}` })
        ] })
      ] });
      for (const [kind, label] of [["rations", "Rations"], ["waterskins", "Waterskins"]]) {
        const items = member.supplies.filter(item => item.kind === kind);
        if (!items.length) card.append(node("p", { className: "mc-party-supply-empty", text: `${text(label, label)}: 0` }));
        for (const item of items) {
          const label = `${member.name}: ${item.name}`;
          card.append(node("div", { className: "mc-party-supply-row", dataset: { partyItem: item.id }, children: [
            node("span", { text: item.name }),
            item.edit ? renderProfileResourceEditor({ label, value: item.quantity, edit: item.edit },
              { sourceUuid: member.sourceUuid, numericEditorLayout: "stacked" }, supplyCommands, suppliesScope)
              : node("span", { text: item.quantity })
          ] }));
        }
      }
      supplies.append(card);
    }
  };
  function detail(key, fallback, values) {
    return node("p", { className: "mc-party-detail", children: [node("strong", { text: `${text(key, fallback)}: ` }),
      values.join(", ") || text("None", "None")] });
  }
  function portrait(member, owner) {
    const fallback = icon("fa-user");
    const holder = node("span", { className: "mc-party-portrait", attrs: { "aria-hidden": "true" }, children: [fallback] });
    if (member.img) {
      const img = node("img", { attrs: { src: member.img, alt: "", loading: "lazy", decoding: "async" },
        on: { error: () => holder.replaceChildren(fallback) } }, owner);
      holder.replaceChildren(img);
    }
    return holder;
  }
  function conditionReference(member, condition) {
    const label = `${condition.label}${condition.numbered ? ` ${condition.value}` : ""}`;
    const description = condition.description ?? [];
    if (!description.some(line => line.trim())) return node("span", { text: label });
    const id = `mc-party-condition-${member.sourceUuid.replace(/[^a-zA-Z0-9_-]/gu, "-")}-${condition.id}`;
    const { trigger, tooltip } = renderProfileTooltip({ label,
      tooltip: [{ label: condition.label, bullets: description }] }, id, rosterScope, { showHeadings: false });
    trigger.dataset.partyCondition = condition.id;
    return node("span", { className: "mc-party-condition-reference", children: [trigger, tooltip] });
  }
  screen.updateParty(state.snapshot?.party);
  return screen;
}
