import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import { createFixtureUser, deleteFixtureUser } from "../support/fixture-users";

async function seedPlanExerciseLog(
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

describe("ON DELETE cascade behavior", () => {
  it("deleting an exercise sets workout_logs.exercise_id to null and preserves exercise_name", async () => {
    const user = await createFixtureUser();
    try {
      const { exercise, log } = await seedPlanExerciseLog(user.client, user.id);

      const { error: deleteError } = await user.client.from("exercises").delete().eq("id", exercise.id);
      expect(deleteError).toBeNull();

      const { data: survivingLog, error: selectError } = await user.client
        .from("workout_logs")
        .select()
        .eq("id", log.id)
        .single();
      expect(selectError).toBeNull();
      expect(survivingLog?.exercise_id).toBeNull();
      expect(survivingLog?.exercise_name).toBe(exercise.name);
    } finally {
      await deleteFixtureUser(user.id);
    }
  });

  it("deleting a training plan cascades to its exercises and workout_logs", async () => {
    const user = await createFixtureUser();
    try {
      const { plan, exercise, log } = await seedPlanExerciseLog(user.client, user.id);

      const { error: deleteError } = await user.client.from("training_plans").delete().eq("id", plan.id);
      expect(deleteError).toBeNull();

      const { data: survivingExercise } = await user.client.from("exercises").select().eq("id", exercise.id);
      expect(survivingExercise).toEqual([]);

      const { data: survivingLog } = await user.client.from("workout_logs").select().eq("id", log.id);
      expect(survivingLog).toEqual([]);
    } finally {
      await deleteFixtureUser(user.id);
    }
  });
});
