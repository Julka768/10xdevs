import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { planNameSchema } from "@/lib/validation/training-plan";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = planNameSchema.safeParse(form.get("name"));
  if (!parsed.success) {
    return context.redirect(`/dashboard/plans?error=${encodeURIComponent("Enter a valid plan name")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/plans?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data, error } = await supabase
    .from("training_plans")
    .insert({ name: parsed.data, user_id: context.locals.user.id })
    .select()
    .single();

  if (error) {
    return context.redirect(`/dashboard/plans?error=${encodeURIComponent("Could not create plan")}`);
  }

  return context.redirect(`/dashboard/plans/${data.id}`);
};
