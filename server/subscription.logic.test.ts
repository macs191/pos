import { describe, expect, it } from "vitest";
import {
  applySubscriptionRenewal,
  calculateRenewalEndDate,
  hasPendingSubscriptionRequest,
} from "./subscription.logic.js";

const day = 86_400_000;

describe("subscription renewal logic", () => {
  it("extends from the existing future end date instead of shortening it", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    const currentEnd = new Date("2026-10-21T00:00:00.000Z");

    expect(calculateRenewalEndDate(currentEnd, 30, now)).toEqual(
      new Date(currentEnd.getTime() + 30 * day)
    );
  });

  it("starts the renewal today when the old subscription already expired", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");

    expect(
      calculateRenewalEndDate("2026-09-01T00:00:00.000Z", 15, now)
    ).toEqual(new Date(now.getTime() + 15 * day));
  });

  it("rejects invalid renewal durations", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");

    expect(() => calculateRenewalEndDate(null, 0, now)).toThrow(
      "INVALID_RENEWAL_DAYS"
    );
    expect(() => calculateRenewalEndDate(null, 366, now)).toThrow(
      "INVALID_RENEWAL_DAYS"
    );
  });

  it("detects only pending requests for the same store", () => {
    expect(
      hasPendingSubscriptionRequest(
        [
          { supermarketId: 10, status: "REJECTED" },
          { supermarketId: 11, status: "PENDING" },
          { supermarketId: 10, status: "PENDING" },
        ],
        10
      )
    ).toBe(true);

    expect(
      hasPendingSubscriptionRequest(
        [{ supermarketId: 11, status: "PENDING" }, null],
        10
      )
    ).toBe(false);
  });

  it("treats a request being processed as active to prevent a duplicate", () => {
    expect(
      hasPendingSubscriptionRequest(
        [{ supermarketId: 10, status: "PROCESSING" }],
        10
      )
    ).toBe(true);
  });

  it("marks renewal unpaid and applies the same request only once", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    const current = {
      id: 7,
      supermarketId: 10,
      status: "EXPIRED",
      isPaid: true,
      endDate: "2026-09-01T00:00:00.000Z",
      customField: "preserved",
    };
    const renewed = applySubscriptionRenewal(current, "sr_1", 30, now);

    expect(renewed).toMatchObject({
      status: "ACTIVE",
      isPaid: false,
      customField: "preserved",
      lastRenewalRequestId: "sr_1",
      endDate: "2026-10-31T00:00:00.000Z",
    });
    expect(applySubscriptionRenewal(renewed, "sr_1", 30, now)).toBe(renewed);
  });
});
