import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import { withTwoFixtureUsers } from "../support/fixture-users";

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

describe("workout_logs RLS", () => {
  it("rejects cross-user access and allows owner CRUD", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { log } = await seedPlanExerciseLog(a.client, a.id);

      const { data: bSelect, error: bSelectError } = await b.client.from("workout_logs").select().eq("id", log.id);
      expect(bSelectError).toBeNull();
      expect(bSelect).toEqual([]);

      const { data: bUpdate, error: bUpdateError } = await b.client
        .from("workout_logs")
        .update({ weight: 999 })
        .eq("id", log.id)
        .select();
      expect(bUpdateError).toBeNull();
      expect(bUpdate).toEqual([]);

      const { data: bDelete, error: bDeleteError } = await b.client
        .from("workout_logs")
        .delete()
        .eq("id", log.id)
        .select();
      expect(bDeleteError).toBeNull();
      expect(bDelete).toEqual([]);

      const { data: aSelect, error: aSelectError } = await a.client.from("workout_logs").select().eq("id", log.id);
      expect(aSelectError).toBeNull();
      expect(aSelect).toHaveLength(1);

      const { data: aUpdate, error: aUpdateError } = await a.client
        .from("workout_logs")
        .update({ weight: 105 })
        .eq("id", log.id)
        .select();
      expect(aUpdateError).toBeNull();
      expect(aUpdate?.[0]?.weight).toBe(105);

      const { data: aDelete, error: aDeleteError } = await a.client
        .from("workout_logs")
        .delete()
        .eq("id", log.id)
        .select();
      expect(aDeleteError).toBeNull();
      expect(aDelete).toHaveLength(1);
    });
  });

  it("rejects column-scoped GRANT escalation on the owner's own row", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { plan: planA, exercise: exerciseA, log } = await seedPlanExerciseLog(a.client, a.id);
      const { plan: planB, exercise: exerciseB } = await seedPlanExerciseLog(b.client, b.id);

      const { data: planUpdateData, error: planUpdateError } = await a.client
        .from("workout_logs")
        .update({ plan_id: planB.id })
        .eq("id", log.id)
        .select();
      expect(planUpdateError).not.toBeNull();
      expect(planUpdateData).toBeNull();

      const { data: exerciseUpdateData, error: exerciseUpdateError } = await a.client
        .from("workout_logs")
        .update({ exercise_id: exerciseB.id })
        .eq("id", log.id)
        .select();
      expect(exerciseUpdateError).not.toBeNull();
      expect(exerciseUpdateData).toBeNull();

      const { data: unchanged } = await a.client.from("workout_logs").select().eq("id", log.id).single();
      expect(unchanged?.plan_id).toBe(planA.id);
      expect(unchanged?.exercise_id).toBe(exerciseA.id);
    });
  });
});
