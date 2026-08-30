import { describe, expect, it } from "vitest";
import { getWeekBounds, isNotFutureDate } from "@/lib/date-utils";

describe("getWeekBounds", () => {
  it("returns the Monday-Sunday week containing a mid-week reference date", () => {
    // 2026-08-21 is a Friday (independently verified: 2026-01-01 is a
    // Thursday, and day 233 of a non-leap year lands on a Friday).
    const bounds = getWeekBounds(new Date("2026-08-21T12:00:00Z"));

    expect(bounds).toEqual({
      currentWeekStart: "2026-08-17",
      currentWeekEnd: "2026-08-23",
      priorWeekStart: "2026-08-10",
      priorWeekEnd: "2026-08-16",
    });
  });

  it("does not shift forward a week when the reference date is itself a Monday", () => {
    const bounds = getWeekBounds(new Date("2026-08-17T00:00:00Z"));
    expect(bounds.currentWeekStart).toBe("2026-08-17");
  });

  it("attributes a Sunday to the week that started the preceding Monday", () => {
    const bounds = getWeekBounds(new Date("2026-08-23T23:59:59Z"));
    expect(bounds.currentWeekStart).toBe("2026-08-17");
    expect(bounds.currentWeekEnd).toBe("2026-08-23");
  });
});

describe("isNotFutureDate", () => {
  // Checked at both just-after-UTC-midnight and just-before-UTC-midnight to
  // prove the one-day grace window depends only on the UTC calendar date of
  // `now`, not on what time of day it happens to be.
  const nowInstants = [
    ["just after UTC midnight", new Date("2026-08-30T00:00:01Z")],
    ["just before UTC midnight", new Date("2026-08-30T23:59:59Z")],
  ] as const;

  it.each(nowInstants)("%s: accepts today's UTC date", (_label, now) => {
    expect(isNotFutureDate("2026-08-30", now)).toBe(true);
  });

  it.each(nowInstants)("%s: accepts tomorrow (the one-day grace window)", (_label, now) => {
    expect(isNotFutureDate("2026-08-31", now)).toBe(true);
  });

  it.each(nowInstants)("%s: rejects the day after tomorrow", (_label, now) => {
    expect(isNotFutureDate("2026-09-01", now)).toBe(false);
  });

  it.each(nowInstants)("%s: accepts a date in the past", (_label, now) => {
    expect(isNotFutureDate("2026-08-29", now)).toBe(true);
  });
});
