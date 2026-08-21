import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { calorieLogInputSchema } from "@/lib/validation/calories";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = calorieLogInputSchema.safeParse({
    calories: form.get("calories"),
    logged_at: form.get("logged_at"),
  });
  if (!parsed.success) {
    return context.redirect(`/dashboard/calories?error=${encodeURIComponent("Enter valid calorie details")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/calories?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase
    .from("calorie_logs")
    .insert({ ...parsed.data, user_id: context.locals.user.id })
    .select()
    .single();

  if (error) {
    return context.redirect(`/dashboard/calories?error=${encodeURIComponent("Could not log calories")}`);
  }

  return context.redirect("/dashboard/calories");
};
