#!/usr/bin/env node
/**
 * Restart the recruitment Next.js keep-alive supervisor on port 3001 only.
 *
 * RULES FOR AGENTS / RESTARTS
 * - Only free TCP port 3001 (lsof + kill those PIDs).
 * - NEVER `pkill -f next` / kill all next processes — other projects may use
 *   :3000 or other ports.
 *
 * By default starts a detached daemon so Cursor/agent shell abort does not
 * kill the server. Pass --foreground to attach to this process.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3001;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(root, ".next", "dev", "lock");
const pidPath = join(root, ".next", "dev-watch.pid");
const watchScript = join(root, "scripts", "dev-watch.mjs");
const foreground = process.argv.includes("--foreground");

function pidsOnPort(port) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
    });
    return [...new Set(out.split(/\s+/).map((s) => s.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function freePort3001() {
  for (const pid of pidsOnPort(PORT)) {
    try {
      process.kill(Number(pid), "SIGTERM");
      console.log(`Stopped PID ${pid} on :${PORT}`);
    } catch {
      // already gone
    }
  }

  execFileSync("sleep", ["1"]);
  for (const pid of pidsOnPort(PORT)) {
    try {
      process.kill(Number(pid), "SIGKILL");
      console.log(`Force-stopped PID ${pid} on :${PORT}`);
    } catch {
      // already gone
    }
  }
}

if (existsSync(pidPath)) {
  try {
    const oldPid = Number(readFileSync(pidPath, "utf8").trim());
    if (Number.isFinite(oldPid) && oldPid > 0) {
      try {
        process.kill(oldPid, "SIGTERM");
        console.log(`Stopped previous supervisor PID ${oldPid}`);
      } catch {
        // already gone
      }
    }
  } catch {
    // ignore
  }
}

freePort3001();

if (existsSync(lockPath)) {
  rmSync(lockPath, { force: true });
  console.log("Removed stale .next/dev/lock");
}

const args = foreground ? [] : ["--daemon"];
console.log(
  foreground
    ? `Starting keep-alive on http://localhost:${PORT} (foreground)…`
    : `Starting detached keep-alive on http://localhost:${PORT}…`,
);

const child = spawn(process.execPath, [watchScript, ...args], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
