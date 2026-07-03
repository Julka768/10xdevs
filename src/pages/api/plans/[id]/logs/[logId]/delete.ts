import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const { id, logId } = context.params;
  if (typeof id !== "string" || typeof logId !== "string") {
    return context.redirect("/dashboard/plans");
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data, error } = await supabase.from("workout_logs").delete().eq("id", logId).select();

  if (error || data.length === 0) {
    return context.redirect(`/dashboard/plans/${id}?error=${encodeURIComponent("Log entry not found")}`);
  }

  return context.redirect(`/dashboard/plans/${id}`);
};
