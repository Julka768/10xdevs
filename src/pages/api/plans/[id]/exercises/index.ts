import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { exerciseInputSchema } from "@/lib/validation/training-plan";

export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  if (typeof id !== "string") {
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

  const { count } = await supabase.from("exercises").select("id", { count: "exact", head: true }).eq("plan_id", id);

  const { error } = await supabase.from("exercises").insert({
    ...parsed.data,
    plan_id: id,
    user_id: context.locals.user.id,
    position: (count ?? 0) + 1,
  });

  if (error) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Could not add exercise")}`);
  }

  return context.redirect(`/dashboard/plans/${id}`);
};
