import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";

export async function seedPlanExerciseLog(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<{ plan: Tables<"training_plans">; exercise: Tables<"exercises">; log: Tables<"workout_logs"> }> {
  const { data: plan } = await client
    .from("training_plans")
    .insert({ user_id: userId, name: "Plan" })
    .select()
    .single();
  if (!plan) throw new Error("expected plan to be created");

  const { data: exercise } = await client
    .from("exercises")
    .insert({ user_id: userId, plan_id: plan.id, name: "Squat", target_sets: 3, target_reps: 5, position: 1 })
    .select()
    .single();
  if (!exercise) throw new Error("expected exercise to be created");

  const { data: log } = await client
    .from("workout_logs")
    .insert({
      user_id: userId,
      plan_id: plan.id,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      weight: 100,
      reps: 5,
      sets_completed: 3,
    })
    .select()
    .single();
  if (!log) throw new Error("expected log to be created");

  return { plan, exercise, log };
}
