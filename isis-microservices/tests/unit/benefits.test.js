import test from "node:test";
import assert from "node:assert/strict";
import {
  GLOBAL_BENEFITS,
  buildUserBenefits,
  getGlobalBenefit
} from "../../src/shared/benefits-service.js";

test("global benefits catalog contains the eleven Isis Gold Card benefits", () => {
  assert.equal(GLOBAL_BENEFITS.length, 11);
  assert.equal(getGlobalBenefit("descuento-consulta-medicina-general").discountPercentage, 50);
  assert.equal(getGlobalBenefit("limpiezas-faciales-profundas").includedUses, 2);
});

test("benefits are active by default for every user", () => {
  const benefits = buildUserBenefits(GLOBAL_BENEFITS, []);

  assert.equal(benefits.length, 11);
  assert.equal(benefits.every((benefit) => benefit.active), true);
  assert.equal(benefits.every((benefit) => benefit.userStatus === "ACTIVE"), true);
});

test("only the selected user benefit becomes inactive", () => {
  const benefits = buildUserBenefits(GLOBAL_BENEFITS, [
    {
      PK: "USER#user-1",
      SK: "BENEFIT#descuento-electrocardiograma",
      benefitId: "descuento-electrocardiograma",
      status: "INACTIVE",
      inactiveAt: "2026-07-30T12:00:00.000Z",
      inactiveBy: "admin"
    }
  ]);
  const inactive = benefits.filter((benefit) => !benefit.active);

  assert.equal(inactive.length, 1);
  assert.equal(inactive[0].benefitId, "descuento-electrocardiograma");
  assert.equal(inactive[0].inactiveBy, "admin");
});
