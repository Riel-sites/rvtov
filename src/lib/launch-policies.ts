export const LAUNCH_POLICIES = {
  photoRetention: "until-user-deletion",
  paymentConfirmationMinutes: 3,
  refunds: "errors-only",
} as const;

export function isRefundEligible(reason: "payment-error" | "unused-tokens" | "changed-mind") {
  return reason === "payment-error";
}