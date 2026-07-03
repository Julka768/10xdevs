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

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data, error } = await supabase.from("exercises").delete().eq("id", exerciseId).select();

  if (error || data.length === 0) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Exercise not found")}`);
  }

  return context.redirect(`/dashboard/plans/${id}`);
};
