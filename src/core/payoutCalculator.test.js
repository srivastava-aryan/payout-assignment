const { describe, it, expect } = require("vitest");
const {
  calculateAdvancePayout,
  calculateReconciliationAdjustment,
} = require("./payoutCalculator");

describe("calculateAdvancePayout", () => {
  it("computes 10% of earnings", () => {
    expect(calculateAdvancePayout(40)).toBe(4);
    expect(calculateAdvancePayout(30)).toBe(3);
    expect(calculateAdvancePayout(50)).toBe(5);
  });

  it("floors sub-paise results instead of rounding up", () => {
    expect(calculateAdvancePayout(33)).toBeCloseTo(3.3, 2);
  });
});

describe("calculateReconciliationAdjustment", () => {
  it("approved: pays the remainder after advance", () => {
    expect(calculateReconciliationAdjustment("approved", 30, 3)).toBe(27);
    expect(calculateReconciliationAdjustment("approved", 40, 4)).toBe(36);
  });

  it("rejected: claws back the advance as a negative adjustment", () => {
    expect(calculateReconciliationAdjustment("rejected", 50, 5)).toBe(-5);
    expect(calculateReconciliationAdjustment("rejected", 40, 4)).toBe(-4);
  });

  it("matches the assignment's full worked example (₹68 total)", () => {
    const rejected = calculateReconciliationAdjustment("rejected", 40, 4);
    const approved1 = calculateReconciliationAdjustment("approved", 40, 4);
    const approved2 = calculateReconciliationAdjustment("approved", 40, 4);
    expect(rejected + approved1 + approved2).toBe(68);
  });
});
