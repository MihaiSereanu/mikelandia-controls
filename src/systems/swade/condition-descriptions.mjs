/** Short paraphrases checked against Core Rules 14.0.3's rules journal, Berserk
 * Edge and relevant powers, plus SWADE 6.0.4's status definitions. References
 * do not apply rules or require the licensed rules module at runtime. */
export const swadeConditionDescriptions = Object.freeze({
  shaken: [
    "Only **free actions** are available, including movement.",
    "A successful **Spirit** roll at the start of your turn clears Shaken. You may also spend a **Benny** to clear it at any time."
  ],
  incapacitated: [
    "You cannot take actions. Recovery depends on what caused Incapacitation.",
    "When damage incapacitates a Wild Card, make the required **Vigor** roll to resolve injury, Bleeding Out or death. Extras are usually out of the fight."
  ],
  dead: ["Marks a combatant as **defeated or out of action**. The actual result determines whether the character is dead, unconscious or otherwise unable to continue."],
  aiming: [
    "Spend an entire turn stationary and aiming a ranged weapon, with no other actions.",
    "For the first action of your next turn, either gain **+2 to the attack** or ignore up to **4 points** of Range, Cover, Called Shot, Scale or Speed penalties."
  ],
  berserk: [
    "The Berserk Edge increases **Strength one die type** and **Toughness by 2**, and ignores one level of Wound penalties. Melee attacks must be **Wild Attacks**; skills needing concentration are unavailable.",
    "A Fighting Critical Failure can hit a random nearby target. Prolonged rage causes Fatigue after five rounds and again after ten, when it ends.",
    "A free-action **Smarts roll at -2** can end the rage early."
  ],
  "wild-attack": ["Gain **+2 to Fighting and resulting damage** for this turn.", "You remain **Vulnerable until the end of your next turn**."],
  defending: ["Gain **+4 Parry until the start of your next turn**.", "Defend takes your whole turn: you may move normally, but cannot run or take other actions."],
  holding: [
    "Delay your turn until you choose to act. Hold carries into later rounds without drawing another Action Card.",
    "Interrupting another action requires an **opposed Athletics** roll. Becoming Shaken or Stunned loses your held turn."
  ],
  bound: [
    "You cannot move and are **Distracted and Vulnerable**. Your only available physical action is attempting to break free.",
    "Use an **Athletics** roll, or a **Strength roll at -2**: success reduces Bound to Entangled; a raise frees you."
  ],
  entangled: ["You cannot move and are **Vulnerable** while entangled.", "Spend an action on an **Athletics** roll, or a **Strength roll at -2**. Success frees you from one entanglement."],
  frightened: [
    "This Fear result gives you **Hesitant for the rest of the encounter**. If you already have Hesitant, the result becomes Panicked instead.",
    "Panicked characters flee their full Pace plus running die and become Shaken."
  ],
  distracted: ["Apply **-2 to all Trait rolls**, normally until the end of your next turn."],
  encumbered: [
    "Carrying more than your allowance causes **-2 Pace** (minimum 1), running rolls, Agility and linked skills, and Vigor rolls to resist Fatigue.",
    "Use the character's Strength and equipment rules to determine the allowance; bulky loads may also cause Encumbrance."
  ],
  prone: [
    "Ranged attacks from at least **3 inches** away suffer **-4 to hit**; this does not stack with Cover. Reduce Area Effect damage by **4**.",
    "In melee, suffer **-2 Parry and Fighting**. Standing costs **2 inches of movement**."
  ],
  stunned: [
    "Fall Prone or to your knees. You cannot move or act, are **Distracted and Vulnerable**, and do not contribute to Gang Up.",
    "At the start of your turn, a free **Vigor** roll can clear Stunned. On success, Vulnerable remains through your next turn; with a raise, it ends this turn.",
    "Distracted follows its usual expiry at the end of your next turn."
  ],
  vulnerable: ["Actions and attacks against you gain **+2**, normally until the end of your next turn. This does not stack with The Drop; use the higher bonus."],
  "bleeding-out": [
    "Make a **Vigor** roll at the start of each turn: failure means death, success keeps you alive until the next check, and a raise stabilizes you.",
    "Outside combat, check each minute. A successful **Healing** action or suitable healing ability can stabilize you."
  ],
  diseased: ["Follow the disease's listed symptoms, Vigor checks and duration; diseases do not share one fixed penalty.", "Recovery may require time, medicine or another suitable treatment."],
  "heart-attack": [
    "Make an immediate **Vigor roll at -2**. Success leaves you Stunned; failure incapacitates you and causes death in **2d6 rounds**.",
    "A **Healing roll at -4** can save an incapacitated victim, who still needs treatment and recovery."
  ],
  "on-fire": ["Take damage from the fire's current intensity at the **start of your turns**. Its intensity may grow or diminish.", "An **Athletics action** can extinguish a fire; circumstances and equipment affect the attempt."],
  poisoned: [
    "Use the poison's **Vigor resistance roll**, strength modifier and specific effects. A failed resistance roll also causes Distracted.",
    "A poison may cause Fatigue, paralysis, unconsciousness or death. Suitable Healing or an antidote may stop its effects."
  ],
  "cover-shield": ["A shield can provide **Cover against ranged attacks from the front and shielded side**. Use its listed Cover value; attacks from other directions ignore that protection."],
  cover: ["Obscured targets impose attack penalties: **Light -2, Medium -4, Heavy -6, Near Total -8**.", "If an attack strikes through the obstacle, resolve the obstacle's protection under the Cover rules."],
  reach: ["The weapon's listed **Reach** extends its melee attack distance. Use that weapon's range to determine which targets it can attack."],
  torch: ["Marks a lit torch or similar light source. Its illumination range and the surrounding darkness determine what can be seen."],
  burrowing: ["Use the creature's **Burrowing Pace** and its burrowing ability's limits on terrain, emergence and attacks."],
  flying: ["Use the creature's **Flying Pace** and flight rules. The ability, equipment or power providing flight determines its limits."],
  invisible: [
    "Use the source of invisibility to determine detection and attack penalties.",
    "The standard invisibility power imposes **-4 on sight-based actions against the target and Notice rolls to detect it**, or **-6 with a raise**."
  ],
  blind: [
    "Apply the sight penalties and recovery rules of whatever caused the blindness.",
    "The blind power gives **-2 on actions requiring sight**, or **-4 with a raise**. Its Vigor recovery check occurs at the end of each following turn."
  ],
  "cold-bodied": ["The target does not radiate normal body heat. Heat-based senses such as **Infravision** may not provide their usual benefit against it."],
  smite: ["Enhances a weapon or ammunition: the standard power adds **+2 damage**, or **+4 with a raise**.", "Use the actual casting result and modifiers for the affected weapon, bonus and duration."],
  protection: ["The standard power grants **+2 Armor**; with a raise, that bonus applies to **Toughness** instead.", "Use the actual casting result and modifiers to determine the bonus and duration."]
});
