import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { exerciseInputSchema } from "@/lib/validation/training-plan";

export const POST: APIRoute = async (context) => {
  const { id, exerciseId } = context.params;
  if (typeof id !== "string" || typeof exerciseId !== "string") {
    return context.redirect("/dashboard/plans");
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = exerciseInputSchema.safeParse({
    name: form.get("name"),
    target_sets: form.get("target_sets"),
    target_reps: form.get("target_reps"),
  });
  if (!parsed.success) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Enter valid exercise details")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data, error } = await supabase.from("exercises").update(parsed.data).eq("id", exerciseId).select();

  if (error || data.length === 0) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Exercise not found")}`);
  }

  return context.redirect(`/dashboard/plans/${id}`);
};
