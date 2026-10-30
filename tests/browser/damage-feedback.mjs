export async function checkDamageFeedback({ root, actor, warhammer, hooks, check, tick }) {
  const health = warhammer ? actor.system.status.wounds : actor.system.attributes.hp;
  const hit = amount => {
    health.value -= amount;
    hooks.emit("updateActor", actor, warhammer ? { "system.status.wounds.value": health.value } : { "system.attributes.hp.value": health.value });
  };
  check("damage is silent on initial load", !root.querySelector(".mc-damage-layer"));
  root.querySelector('[data-route="chat"]').click(); await tick();
  hit(2);
  check("damage follows selected PC on Chat", root.querySelector(".mc-damage-notice")?.textContent.includes(`You took 2 ${warhammer ? "wounds" : "damage"}`));
  check("impact starts immediately", root.classList.contains("mc-damage-shaking"));
  const mist = root.querySelector(".mc-damage-mist");
  check("mist fades in two seconds and passes touches through", getComputedStyle(mist).animationDuration === "2s" && getComputedStyle(mist).pointerEvents === "none");
  const button = root.querySelector(".mc-damage-dismiss"), bounds = button.getBoundingClientRect();
  check("close button has a touch-sized target", bounds.width >= 44 && bounds.height >= 44 && bounds.left >= 0 && bounds.right <= innerWidth);
  hit(1);
  check("rapid hit replaces the previous notification", root.querySelectorAll(".mc-damage-layer").length === 1 && root.querySelector(".mc-damage-notice").textContent.includes("You took 1"));
  check("one-point hit uses singular wound or damage", root.querySelector('.mc-damage-notice [role="status"] > span').textContent === `You took 1 ${warhammer ? "wound" : "damage"}`);
  root.querySelector(".mc-damage-dismiss").click();
  check("close immediately clears every effect", !root.querySelector(".mc-damage-layer") && !root.classList.contains("mc-damage-shaking"));
  health.value += 2; hooks.emit("updateActor", actor, {});
  check("healing produces no effect", !root.querySelector(".mc-damage-layer"));
  hit(1);
  root.querySelector('[data-route="combat"]').click(); await tick();
  check("navigation preserves active damage feedback", !!root.querySelector(".mc-damage-layer"));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  check("Escape clears damage feedback", !root.querySelector(".mc-damage-layer"));
  hit(1);
  await new Promise(resolve => setTimeout(resolve, 2050));
  check("effect and shake automatically clear after two seconds", !root.querySelector(".mc-damage-layer") && !root.classList.contains("mc-damage-shaking"));
  const restore = () => { health.value = 10; hooks.emit("updateActor", actor, {}); };
  restore(); hit(10);
  check("zero-health message retains damage and says You’re down", root.querySelector(".mc-damage-notice").textContent.includes(`You took 10 ${warhammer ? "wounds" : "damage"}`)
    && root.querySelector(".mc-damage-down")?.textContent === "You’re down!");
  root.querySelector(".mc-damage-dismiss").click();
  check("Close dismisses the zero-health notice but preserves mist", !root.querySelector(".mc-damage-notice") && !!root.querySelector(".is-down .mc-damage-mist"));
  restore();
  check("HP or Wounds change clears persistent mist", !root.querySelector(".mc-damage-layer"));
  hit(10);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  check("Escape preserves zero-health mist", !root.querySelector(".mc-damage-notice") && !!root.querySelector(".is-down .mc-damage-mist"));
  restore(); hit(10);
  await new Promise(resolve => setTimeout(resolve, 2050));
  check("only mist remains after the zero-health message expires", !!root.querySelector(".is-down .mc-damage-mist") && !root.querySelector(".mc-damage-notice") && !root.classList.contains("mc-damage-shaking"));
  check("persistent mist has no fade and cannot block input", getComputedStyle(root.querySelector(".mc-damage-mist")).animationName === "none" && getComputedStyle(root.querySelector(".mc-damage-layer")).pointerEvents === "none");
  health.max += 1; hooks.emit("updateActor", actor, {});
  check("max-only and unrelated updates leave zero-health mist intact", !!root.querySelector(".is-down .mc-damage-mist"));
  restore();
  root.querySelector('[data-route="characters"]').click(); await tick();
  hit(10); // Retain the actual zero-health effect for --screenshots captures.
}
