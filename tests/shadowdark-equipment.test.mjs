import test from "node:test";
import assert from "node:assert/strict";
import { createShadowdarkFixture } from "./helpers/shadowdark.mjs";
import { installGlobals } from "./helpers/foundry.mjs";
import { equipmentEdits, editEquipment } from "../src/systems/shadowdark/inventory.mjs";

function setup(t) {
  const f = createShadowdarkFixture();
  installGlobals(t, { game: f.game });
  const sword = f.actor.items.get("sword"), dagger = f.actor.items.get("dagger");
  sword.system.canBeEquipped = dagger.system.canBeEquipped = true;
  let calls = 0;
  f.actor.sheet._onToggleEquipped = async function(event) {
    calls++;
    event.preventDefault();
    assert.equal(this, f.actor.sheet);
    assert.equal(event.currentTarget.closest(".item").dataset.itemId, event.currentTarget.dataset.itemId);
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    item.system.equipped = !item.system.equipped;
    item.system.stashed = false;
    if (item.system.isAShield && item.system.equipped) {
      for (const weapon of this.actor.items) if (weapon.system.isWeapon && weapon.system.equipped && weapon.system.handedness === "2h") {
        if (weapon.system.isVersatile) weapon.system.handedness = "1h";
        else weapon.system.equipped = false;
      }
    }
  };
  f.request = (id, value) => {
    const edit = equipmentEdits(f.actor, f.game).find(edit => edit.id === `equipped:${id}`);
    return { resourceId: edit.id, resourceRevision: edit.revision, expectedValue: edit.value, value };
  };
  f.context = { actor: f.actor, sourceUuid: f.actor.uuid, assertCurrent() {} };
  f.save = payload => editEquipment(payload, f.context, f.game);
  f.calls = () => calls;
  return f;
}

test("equipment controls are restricted to owned carried native-equippable items", t => {
  const f = setup(t), sword = f.actor.items.get("sword");
  assert.deepEqual(equipmentEdits(f.actor, f.game).map(edit => edit.id), ["equipped:sword", "equipped:dagger"]);
  for (const [key, value] of [["stashed", true], ["isIdentified", false], ["canBeEquipped", false], ["equipped", "true"]]) {
    const original = sword.system[key]; sword.system[key] = value;
    assert.equal(equipmentEdits(f.actor, f.game).some(edit => edit.id === "equipped:sword"), false);
    sword.system[key] = original;
  }
  sword.isOwner = false;
  assert.equal(equipmentEdits(f.actor, f.game).some(edit => edit.id === "equipped:sword"), false);
  f.actor.testUserPermission = () => false;
  assert.deepEqual(equipmentEdits(f.actor, f.game), []);
});

test("equipment delegates to the sheet and preserves native shield interactions", async t => {
  const f = setup(t), sword = f.actor.items.get("sword"), dagger = f.actor.items.get("dagger");
  const shield = { id: "shield", name: "Shield", type: "Armor", parent: f.actor,
    uuid: `${f.actor.uuid}.Item.shield`, system: { isPhysical: true, isIdentified: true, stashed: false, equipped: false, canBeEquipped: true, isAShield: true } };
  f.actor.items.push(shield);
  sword.system.handedness = dagger.system.handedness = "2h";
  sword.system.isVersatile = true;
  await f.save(f.request("shield", true));
  assert.equal(shield.system.equipped, true);
  assert.equal(sword.system.handedness, "1h");
  assert.equal(sword.system.equipped, true);
  assert.equal(dagger.system.equipped, false);
  assert.equal(f.calls(), 1);
  await f.save(f.request("shield", false));
  assert.equal(shield.system.equipped, false);
  assert.equal(f.calls(), 2);
});

test("equipment rejects stale target and dependency state, and no-ops without toggling", async t => {
  const f = setup(t), sword = f.actor.items.get("sword"), dagger = f.actor.items.get("dagger");
  const unchanged = await f.save(f.request("sword", true));
  assert.equal(unchanged.unchanged, true);
  assert.equal(f.calls(), 0);
  let payload = f.request("sword", false);
  dagger.system.handedness = "2h";
  await assert.rejects(f.save(payload), { code: "STALE_STATE" });
  payload = f.request("sword", false);
  sword.system.equipped = false;
  await assert.rejects(f.save(payload), { code: "STALE_STATE" });
  assert.equal(f.calls(), 0);
});

test("equipment validates payloads and rechecks ownership, sheet and handler before invoking", async t => {
  const f = setup(t);
  for (const value of [0, 1, "false", null]) await assert.rejects(f.save({ ...f.request("sword", false), value }), { code: "INVALID_INPUT" });
  await assert.rejects(f.save({ ...f.request("sword", false), "system.equipped": false }), { code: "INVALID_INPUT" });
  f.context.assertCurrent = () => { f.actor.sheet._onToggleEquipped = async () => assert.fail("replacement handler"); };
  await assert.rejects(f.save(f.request("sword", false)), { code: "CAPABILITY_UNAVAILABLE" });
  assert.equal(f.calls(), 0);
  f.context.assertCurrent = () => { f.actor.testUserPermission = () => false; };
  await assert.rejects(f.save(f.request("sword", false)), { code: "CAPABILITY_UNAVAILABLE" });
});

test("native equipment errors propagate without an extra toggle", async t => {
  const f = setup(t);
  let calls = 0;
  f.actor.sheet._onToggleEquipped = async () => { calls++; throw new Error("native refusal"); };
  await assert.rejects(f.save(f.request("sword", false)), /native refusal/u);
  assert.equal(calls, 1);
  assert.equal(f.actor.items.get("sword").system.equipped, true);
});
