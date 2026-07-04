import http from "node:http";
import { URL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTwoFixtureUsers } from "../support/fixture-users";
import { buildSessionCookieHeader } from "../support/session-cookie";
import { startDevServer, type DevServerHandle } from "../support/dev-server";
import { seedPlanExerciseLog } from "../support/seed";

const RAW_DB_ERROR_PATTERN =
  /relation|column|constraint|permission denied|PGRST|duplicate key|null value|row-level security|policy|violates/i;

interface HttpResult {
  status: number;
  location: string | null;
}

async function postForm(url: string, cookie: string, form: URLSearchParams): Promise<HttpResult> {
  const target = new URL(url);
  const body = form.toString();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          Cookie: cookie,
          Origin: target.origin,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

describe("plans API route authorization (IDOR)", () => {
  let devServer: DevServerHandle | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    devServer = await startDevServer();
    baseUrl = devServer.baseUrl;
  }, 60_000);

  afterAll(async () => {
    if (devServer) {
      await devServer.stop();
    }
  }, 30_000);

  function expectSafeRedirect(result: HttpResult): void {
    expect(result.status).toBeGreaterThanOrEqual(300);
    expect(result.status).toBeLessThan(400);
    if (result.location) {
      const errorParam = new URL(result.location, baseUrl).searchParams.get("error");
      if (errorParam) {
        expect(errorParam).not.toMatch(RAW_DB_ERROR_PATTERN);
      }
    }
  }

  it("rename: rejects cross-user plan rename", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { plan } = await seedPlanExerciseLog(a.client, a.id);
      const cookie = await buildSessionCookieHeader(b);

      const result = await postForm(
        `${baseUrl}/api/plans/${plan.id}/rename`,
        cookie,
        new URLSearchParams({ name: "hijacked" }),
      );
      expectSafeRedirect(result);

      const { data: unchanged } = await a.client.from("training_plans").select().eq("id", plan.id).single();
      expect(unchanged?.name).toBe(plan.name);
    });
  }, 20_000);

  it("delete plan: rejects cross-user plan delete", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { plan } = await seedPlanExerciseLog(a.client, a.id);
      const cookie = await buildSessionCookieHeader(b);

      const result = await postForm(`${baseUrl}/api/plans/${plan.id}/delete`, cookie, new URLSearchParams());
      expectSafeRedirect(result);

      const { data: stillExists } = await a.client.from("training_plans").select().eq("id", plan.id);
      expect(stillExists).toHaveLength(1);
    });
  }, 20_000);

  it("create exercise: rejects cross-user exercise creation under another user's plan", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { plan } = await seedPlanExerciseLog(a.client, a.id);
      const cookie = await buildSessionCookieHeader(b);

      const result = await postForm(
        `${baseUrl}/api/plans/${plan.id}/exercises`,
        cookie,
        new URLSearchParams({ name: "Bench", target_sets: "3", target_reps: "8" }),
      );
      expectSafeRedirect(result);

      const { data: exercisesUnderPlan } = await a.client.from("exercises").select().eq("plan_id", plan.id);
      expect(exercisesUnderPlan).toHaveLength(1);
    });
  }, 20_000);

  it("update exercise: rejects cross-user exercise update", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { plan, exercise } = await seedPlanExerciseLog(a.client, a.id);
      const cookie = await buildSessionCookieHeader(b);

      const result = await postForm(
        `${baseUrl}/api/plans/${plan.id}/exercises/${exercise.id}/update`,
        cookie,
        new URLSearchParams({ name: "hijacked", target_sets: "1", target_reps: "1" }),
      );
      expectSafeRedirect(result);

      const { data: unchanged } = await a.client.from("exercises").select().eq("id", exercise.id).single();
      expect(unchanged?.name).toBe(exercise.name);
    });
  }, 20_000);

  it("delete exercise: rejects cross-user exercise delete", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { plan, exercise } = await seedPlanExerciseLog(a.client, a.id);
      const cookie = await buildSessionCookieHeader(b);

      const result = await postForm(
        `${baseUrl}/api/plans/${plan.id}/exercises/${exercise.id}/delete`,
        cookie,
        new URLSearchParams(),
      );
      expectSafeRedirect(result);

      const { data: stillExists } = await a.client.from("exercises").select().eq("id", exercise.id);
      expect(stillExists).toHaveLength(1);
    });
  }, 20_000);

  it("create log: rejects cross-user workout-log creation", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { plan, exercise } = await seedPlanExerciseLog(a.client, a.id);
      const cookie = await buildSessionCookieHeader(b);
      const today = new Date().toISOString().slice(0, 10);

      const result = await postForm(
        `${baseUrl}/api/plans/${plan.id}/exercises/${exercise.id}/logs`,
        cookie,
        new URLSearchParams({ weight: "50", reps: "5", sets_completed: "3", logged_at: today }),
      );
      expectSafeRedirect(result);

      const { data: logsUnderPlan } = await a.client.from("workout_logs").select().eq("plan_id", plan.id);
      expect(logsUnderPlan).toHaveLength(1);
    });
  }, 20_000);

  it("update log: rejects cross-user log update", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { plan, log } = await seedPlanExerciseLog(a.client, a.id);
      const cookie = await buildSessionCookieHeader(b);

      const result = await postForm(
        `${baseUrl}/api/plans/${plan.id}/logs/${log.id}/update`,
        cookie,
        new URLSearchParams({ weight: "999", reps: "1", sets_completed: "1", logged_at: log.logged_at.slice(0, 10) }),
      );
      expectSafeRedirect(result);

      const { data: unchanged } = await a.client.from("workout_logs").select().eq("id", log.id).single();
      expect(unchanged?.weight).toBe(log.weight);
    });
  }, 20_000);

  it("delete log: rejects cross-user log delete", async () => {
    await withTwoFixtureUsers(async (a, b) => {
      const { plan, log } = await seedPlanExerciseLog(a.client, a.id);
      const cookie = await buildSessionCookieHeader(b);

      const result = await postForm(
        `${baseUrl}/api/plans/${plan.id}/logs/${log.id}/delete`,
        cookie,
        new URLSearchParams(),
      );
      expectSafeRedirect(result);

      const { data: stillExists } = await a.client.from("workout_logs").select().eq("id", log.id);
      expect(stillExists).toHaveLength(1);
    });
  }, 20_000);
});
