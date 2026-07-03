import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { workoutLogInputSchema } from "@/lib/validation/training-plan";

export const POST: APIRoute = async (context) => {
  const { id, exerciseId } = context.params;
  if (typeof id !== "string" || typeof exerciseId !== "string") {
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
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Enter valid workout details")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data: exercise } = await supabase
    .from("exercises")
    .select("name")
    .eq("id", exerciseId)
    .eq("plan_id", id)
    .maybeSingle();

  if (!exercise) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Exercise not found")}`);
  }

  const { error } = await supabase.from("workout_logs").insert({
    ...parsed.data,
    user_id: context.locals.user.id,
    plan_id: id,
    exercise_id: exerciseId,
    exercise_name: exercise.name,
  });

  if (error) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Could not log workout")}`);
  }

  return context.redirect(`/dashboard/plans/${id}`);
};
