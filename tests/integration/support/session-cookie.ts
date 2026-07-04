import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import type { FixtureUser } from "./fixture-users";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set — copy .env.test.example to .env.test with the values \`supabase start\` prints.`,
    );
  }
  return value;
}

/**
 * Derives the real `Cookie` header a browser would send after sign-in, by driving
 * an @supabase/ssr server client's own storage adapter — this is the same encoding
 * (base64url, possibly chunked) the app's middleware expects, without hand-rolling it.
 */
export async function buildSessionCookieHeader(user: FixtureUser): Promise<string> {
  const {
    data: { session },
  } = await user.client.auth.getSession();
  if (!session) {
    throw new Error(`Fixture user ${user.email} has no active session to derive cookies from`);
  }

  const jar = new Map<string, string>();
  const ssrClient = createServerClient<Database>(
    requireEnv("SUPABASE_URL", SUPABASE_URL),
    requireEnv("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => {
            if (value) {
              jar.set(name, value);
            } else {
              jar.delete(name);
            }
          });
        },
      },
    },
  );

  const { error } = await ssrClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) {
    throw new Error(`Failed to derive session cookies for ${user.email}: ${error.message}`);
  }

  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}
