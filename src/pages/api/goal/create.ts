import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { goalInputSchema } from "@/lib/validation/goal";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = goalInputSchema.safeParse({
    goal_type: form.get("goal_type"),
  });
  if (!parsed.success) {
    return context.redirect(`/dashboard/goal?error=${encodeURIComponent("Choose a valid goal")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/goal?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase
    .from("body_composition_goals")
    .insert({ user_id: context.locals.user.id, goal_type: parsed.data.goal_type });

  if (error) {
    return context.redirect(`/dashboard/goal?error=${encodeURIComponent("Could not save goal")}`);
  }

  return context.redirect("/dashboard/goal");
};
