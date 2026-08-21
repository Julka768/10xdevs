import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { calorieLogInputSchema } from "@/lib/validation/calories";

export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  if (typeof id !== "string") {
    return context.redirect("/dashboard/calories");
  }

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

  const { data, error } = await supabase.from("calorie_logs").update(parsed.data).eq("id", id).select();

  if (error || data.length === 0) {
    return context.redirect(`/dashboard/calories?error=${encodeURIComponent("Log entry not found")}`);
  }

  return context.redirect("/dashboard/calories");
};
