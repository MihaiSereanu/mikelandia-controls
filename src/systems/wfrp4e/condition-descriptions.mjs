/** Player-supplied 5e references; Grappling summarizes WFRP5_Core_Rulebook_06_10_26.pdf, p.167. */
export const warhammer5eConditionDescriptions = Object.freeze({
  ablaze: [
    "End of each Round: suffer **1d10 Damage**, reduced by Toughness Bonus and AP on your least-protected Hit Location.",
    "Each extra Ablaze adds **+1 Damage**.",
    "Reaching 0 Wounds causes a **Critical Wound to the Body**.",
    "A **successful Athletics Test** removes **1 Ablaze +1 for each SL above +1 SL**. A **+0 SL** success still removes 1."
  ],
  besmirched: [
    "Disadvantage on all **Fellowship Tests** until cleaned.",
    "Does not stack."
  ],
  bleeding: [
    "Lose **1 Wound per Bleeding Condition** at the end of each Round, ignoring Toughness Bonus and AP.",
    "At 0 Wounds, make a **Challenging (+0 SL) Endurance Test** each Round or become Unconscious.",
    "If Unconscious, Bleeding, and at 0 Wounds, roll **1d10 each Round**. Roll equal to or below your Bleeding Conditions and you die. A 10 removes one Bleeding.",
    "You cannot wake until all Bleeding Conditions are removed.",
    "Recovering 1 Wound removes 1 Bleeding.",
    "A **successful Challenging (+0 SL) Heal Test** removes **Intelligence Bonus + SL Bleeding Conditions**. Add the Test's positive SL; a **+0 SL** success adds 0.",
    "**Bandage:** spend an Action to remove 1 Bleeding, with no Test. You may apply a Bandage as part of a Heal Test, **even if the Test fails**."
  ],
  blinded: [
    "Cannot perform tasks that require sight, including reading and Ranged Attacks.",
    "Disadvantage on Melee Attacks and other sight-dependent Tests.",
    "Melee Attacks against you gain Advantage unless the attacker is also Blinded.",
    "Normally remove 1 Blinded at the end of your Turn."
  ],
  broken: [
    "On your Turn, use your **Move and Action to Flee** until safely hidden.",
    "**-1 SL per Broken Condition** to Tests not involving running or hiding.",
    "You cannot rally while Engaged.",
    "If not Engaged, make a **Cool Test** at the end of each Round. Success removes **1 Broken +1 for each SL above +1 SL**; a **+0 SL** success still removes 1.",
    "Spending a full Round hidden from enemies removes 1 Broken."
  ],
  deafened: [
    "Cannot understand speech without **Lip Reading**.",
    "Every **6 Rounds**, make a **Challenging (+0 SL) Endurance Test**.",
    "Success removes **1 Deafened +1 for each SL above +1 SL**; a **+0 SL** success still removes 1."
  ],
  entangled: [
    "You cannot Move.",
    "**-1 SL per Entangled Condition** to Actions involving movement, including Grappling.",
    "Spend your Action on an **Opposed Strength Test** against the source. If it has no Strength, use the **Strength of Materials** table (**p. 186**): wool 10, twine 25, rope 45, manacles 65, heavy iron chain 105.",
    "Winning removes **1 Entangled +1 for each winning SL above +1 SL**; a tie won by the initiator (**+0 SL**) still removes 1."
  ],
  fatigued: [
    "**-1 SL to all Tests per Fatigued Condition**.",
    "Removed by appropriate rest, Prayer, Spell, or ending the effect causing it."
  ],
  poisoned: [
    "**-1 SL to all Tests per Poisoned Condition**.",
    "Lose **1 Wound per Poisoned Condition** at the end of each Round, ignoring Toughness Bonus and AP.",
    "At 0 Wounds, you cannot heal Wounds until all Poisoned Conditions are removed.",
    "If Unconscious, make an **Endurance Test every Toughness Bonus Rounds** or die.",
    "End of each Round: a **successful Endurance Test** removes **1 Poisoned +1 for each SL above +1 SL**. Normally **Challenging (+0 SL)**; Difficulty depends on the poison or venom.",
    "A successful **Heal Test** removes Poisoned the same way.",
    "Once all Poisoned Conditions are removed, gain **1 Fatigued**."
  ],
  prone: [
    "Your Move can only be used to **stand up** or **crawl at half Walking pace**.",
    "Disadvantage on Tests involving movement.",
    "Melee Attacks against you gain Advantage.",
    "Does not stack. Standing removes Prone."
  ],
  stunned: [
    "Halve Movement.",
    "**-1 SL to all Tests per Stunned Condition**.",
    "End of each Round: a **successful Challenging (+0 SL) Endurance Test** removes **1 Stunned +1 for each SL above +1 SL**; a **+0 SL** success still removes 1.",
    "Once all Stunned are removed, gain **1 Fatigued** if you do not already have one.",
    "If Stunned exceeds your **Toughness Bonus**, gain **Unconscious**."
  ],
  surprised: [
    "You cannot take an **Action or Move**.",
    "You cannot defend yourself in Opposed Tests.",
    "Melee Attacks against you gain **+2 SL**.",
    "Does not stack.",
    "Remove it at the end of the Round or after the first attack against you."
  ],
  unconscious: [
    "You can do nothing and are **Helpless**.",
    "Does not stack.",
    "Becoming Unconscious removes all Stunned Conditions.",
    "You normally wake after a few hours or when the cause ends.",
    "If Fortune removes Unconscious without removing its cause, you become Unconscious again at the end of the Round."
  ],
  grappling: [
    "Declare a grapple before making an **unarmed attack**. If you win the Opposed Test, both combatants become Grappling and your opponent gains **1 Entangled**.",
    "If you begin your Turn Grappling, use your **Action** for an **Opposed Strength Test**.",
    "If you win, choose: deal **SB + SL Damage, ignoring Armour Points**; give your opponent **1 Entangled, plus 1 per SL after the first**; or remove that many **Entangled** from yourself.",
    "For damage, use your **Strength Test roll** to determine Hit Location."
  ]
});
