import { describe, expect, it } from "vitest";
import { withTwoFixtureUsers } from "../support/fixture-users";

describe("training_plans RLS", () => {
  it("rejects cross-user access and allows owner CRUD", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { data: plan, error: insertError } = await a.client
        .from("training_plans")
        .insert({ user_id: a.id, name: "A's plan" })
        .select()
        .single();
      expect(insertError).toBeNull();
      if (!plan) throw new Error("expected plan to be created");

      const { data: bSelect, error: bSelectError } = await b.client.from("training_plans").select().eq("id", plan.id);
      expect(bSelectError).toBeNull();
      expect(bSelect).toEqual([]);

      const { data: bUpdate, error: bUpdateError } = await b.client
        .from("training_plans")
        .update({ name: "hijacked" })
        .eq("id", plan.id)
        .select();
      expect(bUpdateError).toBeNull();
      expect(bUpdate).toEqual([]);

      const { data: bDelete, error: bDeleteError } = await b.client
        .from("training_plans")
        .delete()
        .eq("id", plan.id)
        .select();
      expect(bDeleteError).toBeNull();
      expect(bDelete).toEqual([]);

      const { data: aSelect, error: aSelectError } = await a.client.from("training_plans").select().eq("id", plan.id);
      expect(aSelectError).toBeNull();
      expect(aSelect).toHaveLength(1);

      const { data: aUpdate, error: aUpdateError } = await a.client
        .from("training_plans")
        .update({ name: "renamed by owner" })
        .eq("id", plan.id)
        .select();
      expect(aUpdateError).toBeNull();
      expect(aUpdate?.[0]?.name).toBe("renamed by owner");

      const { data: aDelete, error: aDeleteError } = await a.client
        .from("training_plans")
        .delete()
        .eq("id", plan.id)
        .select();
      expect(aDeleteError).toBeNull();
      expect(aDelete).toHaveLength(1);
    });
  });
});
