import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { workoutLogInputSchema } from "@/lib/validation/training-plan";

export const POST: APIRoute = async (context) => {
  const { id, logId } = context.params;
  if (typeof id !== "string" || typeof logId !== "string") {
    return context.redirect("/dashboard/plans");
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = workoutLogInputSchema.safeParse({
    weight: form.get("weight"),
    reps: form.get("reps"),
    sets_completed: form.get("sets_completed"),
    logged_at: form.get("logged_at"),
  });
  if (!parsed.success) {
    return context.redirect(`/dashboard/plans/${id}/log?error=${encodeURIComponent("Enter valid workout details")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/plans/${id}/log?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data, error } = await supabase.from("workout_logs").update(parsed.data).eq("id", logId).select();

  if (error) {
    return context.redirect(`/dashboard/plans/${id}/log?error=${encodeURIComponent("Could not update workout log")}`);
  }
  if (data.length === 0) {
    return context.redirect(`/dashboard/plans/${id}/log?error=${encodeURIComponent("Log entry not found")}`);
  }

  return context.redirect(`/dashboard/plans/${id}/log`);
};
