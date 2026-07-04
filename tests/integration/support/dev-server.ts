import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const DEV_SERVER_PORT = 4399;
const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

export interface DevServerHandle {
  baseUrl: string;
  stop: () => Promise<void>;
}

function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"]);
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // process group already gone
  }
}

async function waitUntilReady(baseUrl: string, child: ChildProcess, output: string[]): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited early (code ${child.exitCode}):\n${output.join("")}`);
    }
    try {
      await fetch(baseUrl);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  throw new Error(
    `Dev server did not become ready within ${READY_TIMEOUT_MS}ms: ${String(lastError)}\n${output.join("")}`,
  );
}

export async function startDevServer(): Promise<DevServerHandle> {
  const baseUrl = `http://localhost:${DEV_SERVER_PORT}`;

  const child = spawn("npm", ["run", "dev", "--", "--port", String(DEV_SERVER_PORT)], {
    cwd: process.cwd(),
    shell: true,
    detached: process.platform !== "win32",
  });

  const output: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));

  await waitUntilReady(baseUrl, child, output);

  const stop = async (): Promise<void> => {
    if (child.pid) {
      killProcessTree(child.pid);
    }
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once("exit", () => {
        resolve();
      });
      setTimeout(resolve, 5000);
    });
  };

  return { baseUrl, stop };
}
