import type { WeekBounds } from "@/lib/date-utils";

export type TrendDirection = "up" | "down" | "flat";

export function compareValues(current: number | null, prior: number | null): TrendDirection | null {
  if (current === null || prior === null) return null;
  if (current === prior) return "flat";
  return current > prior ? "up" : "down";
}

function inRange(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end;
}

/**
 * Reduces multiple trends (e.g. one per exercise) to a single one for a
 * compact display: whichever of up/down has more votes wins; a tie (including
 * all-flat, or a mix that cancels out) is "flat". Rows with no trend (no
 * data) are ignored, not counted as flat.
 */
export function aggregateTrend(trends: (TrendDirection | null)[]): TrendDirection | null {
  const relevant = trends.filter((t): t is TrendDirection => t !== null);
  if (relevant.length === 0) return null;

  const upCount = relevant.filter((t) => t === "up").length;
  const downCount = relevant.filter((t) => t === "down").length;
  if (upCount > downCount) return "up";
  if (downCount > upCount) return "down";
  return "flat";
}

// --- Training volume ---

export interface WorkoutLogRow {
  exercise_name: string;
  weight: number;
  reps: number;
  sets_completed: number;
  logged_at: string;
}

export interface VolumeComparisonRow {
  exerciseName: string;
  currentVolume: number | null;
  priorVolume: number | null;
  trend: TrendDirection | null;
}

export function computeVolumeComparison(logs: WorkoutLogRow[], bounds: WeekBounds): VolumeComparisonRow[] {
  const volumes = new Map<string, { current: number; prior: number; hasCurrent: boolean; hasPrior: boolean }>();

  for (const log of logs) {
    const volume = log.weight * log.reps * log.sets_completed;
    const entry = volumes.get(log.exercise_name) ?? { current: 0, prior: 0, hasCurrent: false, hasPrior: false };

    if (inRange(log.logged_at, bounds.currentWeekStart, bounds.currentWeekEnd)) {
      entry.current += volume;
      entry.hasCurrent = true;
    } else if (inRange(log.logged_at, bounds.priorWeekStart, bounds.priorWeekEnd)) {
      entry.prior += volume;
      entry.hasPrior = true;
    }

    volumes.set(log.exercise_name, entry);
  }

  return [...volumes.entries()].map(([exerciseName, entry]) => {
    const currentVolume = entry.hasCurrent ? entry.current : null;
    const priorVolume = entry.hasPrior ? entry.prior : null;
    return { exerciseName, currentVolume, priorVolume, trend: compareValues(currentVolume, priorVolume) };
  });
}

// --- Measurement deltas ---

const CIRCUMFERENCE_FIELDS = ["waist", "chest", "hips", "arms", "thighs"] as const;

export interface BodyMeasurementRow {
  id: string;
  weight: number;
  waist: number | null;
  chest: number | null;
  hips: number | null;
  arms: number | null;
  thighs: number | null;
  logged_at: string;
  created_at: string;
}

export interface MeasurementValueRow {
  measurement_id: string;
  type_id: string;
  value: number;
}

export interface MeasurementTypeRow {
  id: string;
  name: string;
}

export interface MeasurementDeltaRow {
  label: string;
  current: number | null;
  prior: number | null;
  trend: TrendDirection | null;
}

/**
 * Finds the value of `getValue` from the most recently logged row (by
 * logged_at desc, then created_at desc) within [start, end] among rows where
 * `getValue` is non-null — independently per field/type, not a single shared
 * "latest row." A user may log weight daily but a circumference only every
 * few days; using one shared latest row would incorrectly null out a field
 * that was actually set a couple of days earlier in the same week.
 */
function latestNonNullInRange<T extends { logged_at: string; created_at: string }>(
  rows: T[],
  getValue: (row: T) => number | null,
  start: string,
  end: string,
): number | null {
  let best: { value: number; logged_at: string; created_at: string } | null = null;

  for (const row of rows) {
    const value = getValue(row);
    if (value === null || !inRange(row.logged_at, start, end)) continue;
    if (
      !best ||
      row.logged_at > best.logged_at ||
      (row.logged_at === best.logged_at && row.created_at > best.created_at)
    ) {
      best = { value, logged_at: row.logged_at, created_at: row.created_at };
    }
  }

  return best ? best.value : null;
}

export function computeMeasurementDeltas(
  measurements: BodyMeasurementRow[],
  customValues: MeasurementValueRow[],
  customTypes: MeasurementTypeRow[],
  bounds: WeekBounds,
): MeasurementDeltaRow[] {
  const rows: MeasurementDeltaRow[] = [];

  const currentWeight = latestNonNullInRange(
    measurements,
    (m) => m.weight,
    bounds.currentWeekStart,
    bounds.currentWeekEnd,
  );
  const priorWeight = latestNonNullInRange(measurements, (m) => m.weight, bounds.priorWeekStart, bounds.priorWeekEnd);
  if (currentWeight !== null || priorWeight !== null) {
    rows.push({
      label: "weight",
      current: currentWeight,
      prior: priorWeight,
      trend: compareValues(currentWeight, priorWeight),
    });
  }

  for (const field of CIRCUMFERENCE_FIELDS) {
    const getField = (m: BodyMeasurementRow): number | null => m[field];
    const current = latestNonNullInRange(measurements, getField, bounds.currentWeekStart, bounds.currentWeekEnd);
    const prior = latestNonNullInRange(measurements, getField, bounds.priorWeekStart, bounds.priorWeekEnd);
    if (current === null && prior === null) continue;
    rows.push({ label: field, current, prior, trend: compareValues(current, prior) });
  }

  const measurementsById = new Map(measurements.map((m) => [m.id, m]));
  const valuesWithDates = customValues
    .map((v) => {
      const parent = measurementsById.get(v.measurement_id);
      return parent ? { ...v, logged_at: parent.logged_at, created_at: parent.created_at } : null;
    })
    .filter((v): v is MeasurementValueRow & { logged_at: string; created_at: string } => v !== null);

  for (const type of customTypes) {
    const forType = valuesWithDates.filter((v) => v.type_id === type.id);
    const current = latestNonNullInRange(forType, (v) => v.value, bounds.currentWeekStart, bounds.currentWeekEnd);
    const prior = latestNonNullInRange(forType, (v) => v.value, bounds.priorWeekStart, bounds.priorWeekEnd);
    if (current === null && prior === null) continue;
    rows.push({ label: type.name, current, prior, trend: compareValues(current, prior) });
  }

  return rows;
}

// --- Calorie vs. goal ---

export type GoalType = "lose" | "gain" | "maintain";

export interface CalorieLogRow {
  calories: number;
  logged_at: string;
}

export interface CalorieAlignmentResult {
  currentAvgDaily: number | null;
  priorAvgDaily: number | null;
  trend: TrendDirection | null;
  aligned: boolean | null;
}

function averageDailyCalories(logs: CalorieLogRow[], start: string, end: string): number | null {
  const totalsByDay = new Map<string, number>();
  for (const log of logs) {
    if (!inRange(log.logged_at, start, end)) continue;
    totalsByDay.set(log.logged_at, (totalsByDay.get(log.logged_at) ?? 0) + log.calories);
  }
  if (totalsByDay.size === 0) return null;
  const dailyTotals = [...totalsByDay.values()];
  return dailyTotals.reduce((sum, total) => sum + total, 0) / dailyTotals.length;
}

export function computeCalorieAlignment(
  calorieLogs: CalorieLogRow[],
  goalType: GoalType | null,
  bounds: WeekBounds,
): CalorieAlignmentResult {
  const currentAvgDaily = averageDailyCalories(calorieLogs, bounds.currentWeekStart, bounds.currentWeekEnd);
  const priorAvgDaily = averageDailyCalories(calorieLogs, bounds.priorWeekStart, bounds.priorWeekEnd);
  const trend = compareValues(currentAvgDaily, priorAvgDaily);

  let aligned: boolean | null = null;
  if (goalType && trend) {
    if (goalType === "lose") aligned = trend !== "up";
    else if (goalType === "gain") aligned = trend !== "down";
    else aligned = trend === "flat";
  }

  return { currentAvgDaily, priorAvgDaily, trend, aligned };
}
