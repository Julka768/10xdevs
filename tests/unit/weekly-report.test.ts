import { describe, expect, it } from "vitest";
import { getWeekBounds } from "@/lib/date-utils";
import {
  computeCalorieAlignment,
  computeMeasurementDeltas,
  computeVolumeComparison,
  type BodyMeasurementRow,
  type CalorieLogRow,
  type MeasurementTypeRow,
  type MeasurementValueRow,
  type WorkoutLogRow,
} from "@/lib/weekly-report";

// Reference week from date-utils.test.ts: current = 2026-08-17..2026-08-23,
// prior = 2026-08-10..2026-08-16.
const bounds = getWeekBounds(new Date("2026-08-21T12:00:00Z"));

describe("computeVolumeComparison", () => {
  it("matches independently hand-computed volume totals per exercise", () => {
    const logs: WorkoutLogRow[] = [
      { exercise_name: "Bench Press", logged_at: "2026-08-11", weight: 100, reps: 5, sets_completed: 3 }, // prior: 1500
      { exercise_name: "Bench Press", logged_at: "2026-08-13", weight: 100, reps: 5, sets_completed: 2 }, // prior: 1000 (total 2500)
      { exercise_name: "Bench Press", logged_at: "2026-08-18", weight: 110, reps: 5, sets_completed: 5 }, // current: 2750
      { exercise_name: "Squat", logged_at: "2026-08-12", weight: 80, reps: 8, sets_completed: 4 }, // prior: 2560
      { exercise_name: "Squat", logged_at: "2026-08-19", weight: 80, reps: 8, sets_completed: 4 }, // current: 2560
      { exercise_name: "Deadlift", logged_at: "2026-08-20", weight: 120, reps: 3, sets_completed: 3 }, // current only: 1080
    ];

    const result = computeVolumeComparison(logs, bounds);
    const byName = new Map(result.map((r) => [r.exerciseName, r]));

    expect(byName.get("Bench Press")).toEqual({
      exerciseName: "Bench Press",
      priorVolume: 2500,
      currentVolume: 2750,
      trend: "up",
    });
    expect(byName.get("Squat")).toEqual({
      exerciseName: "Squat",
      priorVolume: 2560,
      currentVolume: 2560,
      trend: "flat",
    });
    expect(byName.get("Deadlift")).toEqual({
      exerciseName: "Deadlift",
      priorVolume: null,
      currentVolume: 1080,
      trend: null,
    });
  });
});

describe("computeMeasurementDeltas", () => {
  it("uses the most recent entry per field within each week, independently per field", () => {
    const measurements: BodyMeasurementRow[] = [
      {
        id: "m1",
        weight: 80.0,
        waist: 90,
        chest: null,
        hips: null,
        arms: null,
        thighs: null,
        logged_at: "2026-08-12",
        created_at: "2026-08-12T08:00:00Z",
      },
      {
        id: "m2",
        weight: 79.5,
        waist: null,
        chest: null,
        hips: null,
        arms: null,
        thighs: null,
        logged_at: "2026-08-14",
        created_at: "2026-08-14T08:00:00Z",
      },
      {
        id: "m3",
        weight: 79.0,
        waist: null,
        chest: null,
        hips: null,
        arms: null,
        thighs: null,
        logged_at: "2026-08-19",
        created_at: "2026-08-19T08:00:00Z",
      },
    ];
    const customTypes: MeasurementTypeRow[] = [{ id: "t1", name: "Neck" }];
    const customValues: MeasurementValueRow[] = [
      { measurement_id: "m1", type_id: "t1", value: 38 },
      { measurement_id: "m3", type_id: "t1", value: 38 },
    ];

    const result = computeMeasurementDeltas(measurements, customValues, customTypes, bounds);
    const byLabel = new Map(result.map((r) => [r.label, r]));

    // weight: latest prior entry is m2 (08-14, later than m1's 08-12), not m1.
    expect(byLabel.get("weight")).toEqual({ label: "weight", prior: 79.5, current: 79.0, trend: "down" });

    // waist: only m1 (prior week) ever set it; no current-week row set it.
    expect(byLabel.get("waist")).toEqual({ label: "waist", prior: 90, current: null, trend: null });

    // Untouched circumference fields never appear as rows.
    expect(byLabel.has("chest")).toBe(false);
    expect(byLabel.has("hips")).toBe(false);

    // Neck: prior value came from m1 (08-12), current value from m3 (08-19).
    expect(byLabel.get("Neck")).toEqual({ label: "Neck", prior: 38, current: 38, trend: "flat" });
  });
});

describe("computeCalorieAlignment", () => {
  const priorDays = (calories: number[]): CalorieLogRow[] =>
    calories.map((c, i) => ({ calories: c, logged_at: `2026-08-1${i + 1}` }));
  const currentDays = (calories: number[]): CalorieLogRow[] =>
    calories.map((c, i) => ({ calories: c, logged_at: `2026-08-1${8 + i}` }));

  it("is aligned when a 'lose' goal sees a downward trend", () => {
    const logs = [...priorDays([2000, 2000, 2000]), ...currentDays([1800, 1800])];
    const result = computeCalorieAlignment(logs, "lose", bounds);
    expect(result).toEqual({ priorAvgDaily: 2000, currentAvgDaily: 1800, trend: "down", aligned: true });
  });

  it("is aligned when a 'maintain' goal sees a flat trend", () => {
    const logs = [...priorDays([2200]), ...currentDays([2200])];
    const result = computeCalorieAlignment(logs, "maintain", bounds);
    expect(result).toEqual({ priorAvgDaily: 2200, currentAvgDaily: 2200, trend: "flat", aligned: true });
  });

  it("is not aligned when a 'gain' goal sees a downward trend", () => {
    const logs = [...priorDays([2500]), ...currentDays([2400])];
    const result = computeCalorieAlignment(logs, "gain", bounds);
    expect(result).toEqual({ priorAvgDaily: 2500, currentAvgDaily: 2400, trend: "down", aligned: false });
  });

  it("has no alignment verdict when no goal is set, even with a clear trend", () => {
    const logs = [...priorDays([2000, 2000, 2000]), ...currentDays([1800, 1800])];
    const result = computeCalorieAlignment(logs, null, bounds);
    expect(result.aligned).toBeNull();
  });

  it("has no alignment verdict when the current week has zero entries", () => {
    const logs = priorDays([2000]);
    const result = computeCalorieAlignment(logs, "lose", bounds);
    expect(result).toEqual({ priorAvgDaily: 2000, currentAvgDaily: null, trend: null, aligned: null });
  });
});
