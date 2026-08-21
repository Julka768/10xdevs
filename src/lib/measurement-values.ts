import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { optionalMeasurement } from "@/lib/validation/measurements";

/**
 * Upserts (or deletes) one `measurement_values` row per the user's custom
 * measurement types, based on `custom_<type_id>` fields in `form`. Uses an
 * explicit update-then-insert-if-absent instead of `.upsert()`, since the
 * update GRANT on `measurement_values` is column-scoped to `value` only.
 */
export async function syncCustomMeasurementValues(
  supabase: SupabaseClient<Database>,
  userId: string,
  measurementId: string,
  form: FormData,
): Promise<void> {
  const { data: types } = await supabase.from("measurement_types").select("id").eq("user_id", userId);

  for (const type of types ?? []) {
    const parsed = optionalMeasurement.safeParse(form.get(`custom_${type.id}`));
    const value = parsed.success ? parsed.data : null;

    if (value === null) {
      await supabase.from("measurement_values").delete().eq("measurement_id", measurementId).eq("type_id", type.id);
      continue;
    }

    const { data: updated } = await supabase
      .from("measurement_values")
      .update({ value })
      .eq("measurement_id", measurementId)
      .eq("type_id", type.id)
      .select();

    if (!updated || updated.length === 0) {
      await supabase
        .from("measurement_values")
        .insert({ measurement_id: measurementId, type_id: type.id, value, user_id: userId });
    }
  }
}
