import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { measurementLogInputSchema } from "@/lib/validation/measurements";
import { syncCustomMeasurementValues } from "@/lib/measurement-values";

export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  if (typeof id !== "string") {
    return context.redirect("/dashboard/measurements");
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = measurementLogInputSchema.safeParse({
    weight: form.get("weight"),
    waist: form.get("waist"),
    chest: form.get("chest"),
    hips: form.get("hips"),
    arms: form.get("arms"),
    thighs: form.get("thighs"),
    logged_at: form.get("logged_at"),
  });
  if (!parsed.success) {
    return context.redirect(`/dashboard/measurements?error=${encodeURIComponent("Enter valid measurement details")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/measurements?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data, error } = await supabase.from("body_measurements").update(parsed.data).eq("id", id).select();

  if (error) {
    return context.redirect(`/dashboard/measurements?error=${encodeURIComponent("Could not update measurement")}`);
  }
  if (data.length === 0) {
    return context.redirect(`/dashboard/measurements?error=${encodeURIComponent("Log entry not found")}`);
  }

  await syncCustomMeasurementValues(supabase, context.locals.user.id, id, form);

  return context.redirect("/dashboard/measurements");
};
