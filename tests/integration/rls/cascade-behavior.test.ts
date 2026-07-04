import { describe, expect, it } from "vitest";
import { createFixtureUser, deleteFixtureUser } from "../support/fixture-users";
import { seedPlanExerciseLog } from "../support/seed";

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
