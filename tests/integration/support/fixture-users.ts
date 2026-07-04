import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FIXTURE_PASSWORD = "fixture-user-password-123!";

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set — copy .env.test.example to .env.test with the values \`supabase start\` prints.`,
    );
  }
  return value;
}

function serviceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv("SUPABASE_URL", SUPABASE_URL),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface FixtureUser {
  id: string;
  email: string;
  client: SupabaseClient<Database>;
}

export async function createFixtureUser(): Promise<FixtureUser> {
  const admin = serviceRoleClient();
  const email = `fixture-${randomUUID()}@example.com`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`Failed to create fixture user: ${error.message}`);
  }

  const client = createClient<Database>(
    requireEnv("SUPABASE_URL", SUPABASE_URL),
    requireEnv("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD });
  if (signInError) {
    throw new Error(`Failed to sign in fixture user: ${signInError.message}`);
  }

  return { id: data.user.id, email, client };
}

export async function deleteFixtureUser(id: string): Promise<void> {
  const admin = serviceRoleClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    throw new Error(`Failed to delete fixture user ${id}: ${error.message}`);
  }
}

export async function withTwoFixtureUsers(fn: (a: FixtureUser, b: FixtureUser) => Promise<void>): Promise<void> {
  const [a, b] = await Promise.all([createFixtureUser(), createFixtureUser()]);
  try {
    await fn(a, b);
  } finally {
    await Promise.all([deleteFixtureUser(a.id), deleteFixtureUser(b.id)]);
  }
}
