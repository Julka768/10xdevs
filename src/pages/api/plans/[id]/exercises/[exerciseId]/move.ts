import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const { id, exerciseId } = context.params;
  if (typeof id !== "string" || typeof exerciseId !== "string") {
    return context.redirect("/dashboard/plans");
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const direction = form.get("direction");
  if (direction !== "up" && direction !== "down") {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Invalid move direction")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, position")
    .eq("plan_id", id)
    .order("position", { ascending: true });

  if (!exercises) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Could not reorder exercise")}`);
  }

  const index = exercises.findIndex((exercise) => exercise.id === exerciseId);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || neighborIndex < 0 || neighborIndex >= exercises.length) {
    return context.redirect(`/dashboard/plans/${id}`);
  }

  const current = exercises[index];
  const neighbor = exercises[neighborIndex];
  const tempPosition = Math.max(...exercises.map((exercise) => exercise.position)) + 1;

  const { error: tempError } = await supabase.from("exercises").update({ position: tempPosition }).eq("id", current.id);
  if (tempError) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Could not reorder exercise")}`);
  }

  const { error: neighborError } = await supabase
    .from("exercises")
    .update({ position: current.position })
    .eq("id", neighbor.id);
  if (neighborError) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Could not reorder exercise")}`);
  }

  const { error: finalError } = await supabase
    .from("exercises")
    .update({ position: neighbor.position })
    .eq("id", current.id);
  if (finalError) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Could not reorder exercise")}`);
  }

  return context.redirect(`/dashboard/plans/${id}`);
};
