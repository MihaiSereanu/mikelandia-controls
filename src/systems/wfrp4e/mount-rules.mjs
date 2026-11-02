/** WFRP5 Core Rulebook, pp. 157 and 168; automation checked against system 10.1.2. */
export const warhammer5eMountRules = Object.freeze([
  { label: "Mount Rules", bullets: [
    "Use your mount’s **Movement**. Tests to Sprint, Leap, Charge or similar use **Ride**, taken as Free Actions.",
    "Unusual mounted actions use **Ride or the appropriate Skill, whichever is lower**. Failure usually means falling, typically **2 yards**.",
    "**Cavalry weapons** gain Advantage on Melee Tests against opponents smaller than your mount.",
    "Attackers choose whether to target **rider or mount**. Attackers smaller than the mount have Disadvantage on Melee attacks or touch attempts against the rider, unless using a weapon with **Long or greater Reach**.",
    "When Charging, you may use your mount’s **Strength Bonus** instead of your own for weapon Damage.",
    "**Dodge has Disadvantage** while mounted, unless you have **Trick Rider**.",
    "A mount without **Trained (War)** gives you Disadvantage on all Tests involving it during combat and is likely to flee."
  ] },
  { label: "Automated", bullets: [
    "Ticking **Mounted** uses your mount’s Move, plus its Walk/Run values where automatic calculation is enabled."
  ] },
  { label: "Not Automated", bullets: [
    "Apply Cavalry Advantage, rider-targeting penalties, war-training penalties and charging Strength Bonus manually. Make the required riding and control Tests.",
    "The installed system currently applies **−2 SL to mounted Dodge**, rather than the 5e Disadvantage rule; check and adjust the roll dialog."
  ] }
]);
