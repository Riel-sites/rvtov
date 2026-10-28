import { describe, it as test } from "node:test";
import { strict as assert } from "node:assert";
import { isRefundEligible, LAUNCH_POLICIES } from "./launch-policies";

describe("confirmed launch policies", () => {
  test("photos remain until user deletion rather than expiring", () => {
    assert.equal(LAUNCH_POLICIES.photoRetention, "until-user-deletion");
  });
  test("manual confirmation target is three minutes", () => {
    assert.equal(LAUNCH_POLICIES.paymentConfirmationMinutes, 3);
  });
  test("refunds apply to errors, not unused tokens or a change of mind", () => {
    assert.equal(isRefundEligible("payment-error"), true);
    assert.equal(isRefundEligible("unused-tokens"), false);
    assert.equal(isRefundEligible("changed-mind"), false);
  });
});