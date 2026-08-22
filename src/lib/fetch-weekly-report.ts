import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getWeekBounds, type WeekBounds } from "@/lib/date-utils";
import {
  computeCalorieAlignment,
  computeMeasurementDeltas,
  computeVolumeComparison,
  type CalorieAlignmentResult,
  type GoalType,
  type MeasurementDeltaRow,
  type VolumeComparisonRow,
} from "@/lib/weekly-report";

export interface WeeklyReportData {
  bounds: WeekBounds;
  volume: VolumeComparisonRow[];
  measurements: MeasurementDeltaRow[];
  calories: CalorieAlignmentResult;
}

/**
 * Fetches the current+prior week's rows from the four source tables (relying
 * on RLS for ownership scoping, same as every other dashboard page — no
 * explicit user_id filter) and runs them through the pure comparison
 * functions from weekly-report.ts.
 */
export async function fetchWeeklyReportData(
  supabase: SupabaseClient<Database>,
  referenceDate: Date,
): Promise<WeeklyReportData> {
  const bounds = getWeekBounds(referenceDate);

  const { data: workoutLogs } = await supabase
    .from("workout_logs")
    .select("exercise_name, weight, reps, sets_completed, logged_at")
    .gte("logged_at", bounds.priorWeekStart)
    .lte("logged_at", bounds.currentWeekEnd);

  const { data: bodyMeasurements } = await supabase
    .from("body_measurements")
    .select("id, weight, waist, chest, hips, arms, thighs, logged_at, created_at")
    .gte("logged_at", bounds.priorWeekStart)
    .lte("logged_at", bounds.currentWeekEnd);

  const measurementIds = (bodyMeasurements ?? []).map((m) => m.id);
  const { data: customTypes } = await supabase.from("measurement_types").select("id, name");
  const { data: customValues } =
    measurementIds.length > 0
      ? await supabase
          .from("measurement_values")
          .select("measurement_id, type_id, value")
          .in("measurement_id", measurementIds)
      : { data: [] };

  const { data: calorieLogs } = await supabase
    .from("calorie_logs")
    .select("calories, logged_at")
    .gte("logged_at", bounds.priorWeekStart)
    .lte("logged_at", bounds.currentWeekEnd);

  const { data: goal } = await supabase
    .from("body_composition_goals")
    .select("goal_type")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    bounds,
    volume: computeVolumeComparison(workoutLogs ?? [], bounds),
    measurements: computeMeasurementDeltas(bodyMeasurements ?? [], customValues ?? [], customTypes ?? [], bounds),
    calories: computeCalorieAlignment(calorieLogs ?? [], (goal?.goal_type as GoalType | undefined) ?? null, bounds),
  };
}
