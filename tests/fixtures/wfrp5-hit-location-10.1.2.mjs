// Native WFRP system 10.1.2 methods, preserved for regression checks.
// Source: Data/systems/wfrp4e/wfrp4e.js, TestWFRP5e.
export function nativeHitLocationClass(game) {
  return class {
  _reverseDice(roll)
  {
    let reverseRoll = roll.toString();
    if (reverseRoll.length == 1)
    {
      reverseRoll = reverseRoll[0] + "0";
    }
    else if (reverseRoll == "100")
    {
          reverseRoll = "100";
    }
    else 
    {
      reverseRoll = reverseRoll[1] + reverseRoll[0];
    }

    reverseRoll = Number(reverseRoll);
    return reverseRoll;
  }


  async computeHitLocation()
  {
     // Called Shots
     if (this.testData.hitLocation.selected != "roll") // hitLocation.selected is possibly "none" but if so, testData.hitLocation would be false (see constructor) so this won't execute
     {
       this.result.hitloc = game.wfrp4e.tables.hitLocKeyToResult(this.testData.hitLocation.selected);
     }

     // Pre-set hitloc (e.g. editing a test)
     if (this.testData.hitLocation.roll)
     {
        this.result.hitloc = await game.wfrp4e.tables.rollTable("hitloc", { lookup: this.testData.hitLocation.roll, hideDSN: true });
     }

     // No defined hit loc, roll for one
    if (!this.result.hitloc)
    {
      {
        this.result.hitloc = await game.wfrp4e.tables.rollTable("hitloc", { hideDSN: true });
        this.testData.hitLocation.roll = this.result.hitloc.roll; // Prevent editing the test from changing the hit location every time
      }
    }

     this.result.hitloc.roll = (0, eval)(this.result.hitloc.roll); // Cleaner number when editing chat card
     this.result.hitloc.description = game.i18n.localize(this.result.hitloc.description);

     // "rArm" and "lArm" from the table actually means "primary" and "secondary" arm
     // So convert the descriptions to match that. Opposed tests handle displaying
     // which arm was hit, as it is based on the actor's settings
     if (["lArm", "rArm"].includes(this.result.hitloc.result))
     {
       if (this.result.hitloc.result == "rArm")
       {
         this.result.hitloc.description = game.i18n.localize("Primary Arm");
       }
       if (this.result.hitloc.result == "lArm")
       {
         this.result.hitloc.description = game.i18n.localize("Secondary Arm");
       }
     }

     if (this.testData.hitLocation.selected && this.testData.hitLocation.selected != "roll")
     {
       this.result.hitloc.description = this.testData.hitLocation.table[this.testData.hitLocation.selected] + ` (${game.i18n.localize("ROLL.CalledShot")})`;
     }
  }

  };
}
