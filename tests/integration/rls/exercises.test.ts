import { describe, expect, it } from "vitest";
import { withTwoFixtureUsers } from "../support/fixture-users";

describe("exercises RLS", () => {
  it("rejects cross-user access and allows owner CRUD", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { data: plan } = await a.client
        .from("training_plans")
        .insert({ user_id: a.id, name: "A's plan" })
        .select()
        .single();
      if (!plan) throw new Error("expected plan to be created");

      const { data: exercise, error: insertError } = await a.client
        .from("exercises")
        .insert({ user_id: a.id, plan_id: plan.id, name: "Squat", target_sets: 3, target_reps: 5, position: 1 })
        .select()
        .single();
      expect(insertError).toBeNull();
      if (!exercise) throw new Error("expected exercise to be created");

      const { data: bSelect, error: bSelectError } = await b.client.from("exercises").select().eq("id", exercise.id);
      expect(bSelectError).toBeNull();
      expect(bSelect).toEqual([]);

      const { data: bUpdate, error: bUpdateError } = await b.client
        .from("exercises")
        .update({ name: "hijacked" })
        .eq("id", exercise.id)
        .select();
      expect(bUpdateError).toBeNull();
      expect(bUpdate).toEqual([]);

      const { data: bDelete, error: bDeleteError } = await b.client
        .from("exercises")
        .delete()
        .eq("id", exercise.id)
        .select();
      expect(bDeleteError).toBeNull();
      expect(bDelete).toEqual([]);

      const { data: aSelect, error: aSelectError } = await a.client.from("exercises").select().eq("id", exercise.id);
      expect(aSelectError).toBeNull();
      expect(aSelect).toHaveLength(1);

      const { data: aUpdate, error: aUpdateError } = await a.client
        .from("exercises")
        .update({ name: "renamed by owner" })
        .eq("id", exercise.id)
        .select();
      expect(aUpdateError).toBeNull();
      expect(aUpdate?.[0]?.name).toBe("renamed by owner");

      const { data: aDelete, error: aDeleteError } = await a.client
        .from("exercises")
        .delete()
        .eq("id", exercise.id)
        .select();
      expect(aDeleteError).toBeNull();
      expect(aDelete).toHaveLength(1);
    });
  });

  it("rejects plan_id-squatting: inserting an exercise against another user's plan_id", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { data: plan } = await a.client
        .from("training_plans")
        .insert({ user_id: a.id, name: "A's plan" })
        .select()
        .single();
      if (!plan) throw new Error("expected plan to be created");

      const { data, error } = await b.client
        .from("exercises")
        .insert({ user_id: b.id, plan_id: plan.id, name: "Squat", target_sets: 3, target_reps: 5, position: 1 })
        .select();

      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });
  });
});
