import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  if (typeof id !== "string") {
    return context.redirect("/dashboard/measurements");
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/measurements?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data, error } = await supabase.from("measurement_types").delete().eq("id", id).select();

  if (error || data.length === 0) {
    return context.redirect(`/dashboard/measurements?error=${encodeURIComponent("Measurement type not found")}`);
  }

  return context.redirect("/dashboard/measurements");
};
