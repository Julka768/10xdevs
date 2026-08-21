import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { measurementTypeInputSchema } from "@/lib/validation/measurements";

const MAX_CUSTOM_TYPES = 10;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = measurementTypeInputSchema.safeParse({ name: form.get("name") });
  if (!parsed.success) {
    return context.redirect(`/dashboard/measurements?error=${encodeURIComponent("Enter a valid type name")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/measurements?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { count } = await supabase
    .from("measurement_types")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.locals.user.id);

  if ((count ?? 0) >= MAX_CUSTOM_TYPES) {
    return context.redirect(
      `/dashboard/measurements?error=${encodeURIComponent("You can only add up to 10 custom measurement types")}`,
    );
  }

  const { error } = await supabase
    .from("measurement_types")
    .insert({ ...parsed.data, user_id: context.locals.user.id })
    .select()
    .single();

  if (error) {
    return context.redirect(`/dashboard/measurements?error=${encodeURIComponent("Could not add measurement type")}`);
  }

  return context.redirect("/dashboard/measurements");
};
