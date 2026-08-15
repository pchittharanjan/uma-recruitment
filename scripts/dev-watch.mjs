#!/usr/bin/env node
/**
 * Keep-alive supervisor for the recruitment Next.js dev server on :3001.
 *
 * WHY THIS EXISTS
 * Agent/Cursor tool shells often get aborted (status: aborted). When `next`
 * is a child of that shell, the whole process group dies — the server looks
 * like it "stopped randomly" even though Next itself did not crash.
 *
 * RULES FOR AGENTS / RESTARTS
 * - Only free TCP port 3001 (lsof + kill those PIDs).
 * - NEVER `pkill -f next` / kill all next processes — other projects may use
 *   :3000 or other ports.
 *
 * Usage:
 *   npm run dev              # foreground keep-alive (survives Next exits)
 *   npm run dev:daemon       # detached keep-alive (survives shell abort)
 *   node scripts/dev-watch.mjs --daemon
 */
import { spawn, execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3001;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logDir = join(root, ".next");
const logPath = join(logDir, "dev-watch.log");
const pidPath = join(logDir, "dev-watch.pid");
const scriptPath = fileURLToPath(import.meta.url);

const daemon = process.argv.includes("--daemon");

function stamp(msg) {
  return `[${new Date().toISOString()}] ${msg}`;
}

function log(msg) {
  const line = stamp(msg);
  console.log(line);
  // Daemon mode already redirects stdout to logPath — skip double-append.
  if (!process.stdout.isTTY) return;
  try {
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    appendFileSync(logPath, line + "\n");
  } catch {
    // best-effort file log
  }
}

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

/** Free :3001 only — do not touch other ports or unrelated next processes. */
function freePort3001() {
  for (const pid of pidsOnPort(PORT)) {
    try {
      process.kill(Number(pid), "SIGTERM");
      log(`Stopped PID ${pid} on :${PORT} (SIGTERM)`);
    } catch {
      // already gone
    }
  }
  try {
    execFileSync("sleep", ["1"]);
  } catch {
    // ignore
  }
  for (const pid of pidsOnPort(PORT)) {
    try {
      process.kill(Number(pid), "SIGKILL");
      log(`Force-stopped PID ${pid} on :${PORT} (SIGKILL)`);
    } catch {
      // already gone
    }
  }
}

function savePid(pid) {
  try {
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    writeFileSync(pidPath, String(pid));
  } catch {
    // ignore
  }
}

async function runLoop() {
  log(`dev-watch supervisor starting (port ${PORT}, pid ${process.pid})`);
  log(`Log file: ${logPath}`);
  log("Restarts free :3001 only — never pkill all next processes.");
  savePid(process.pid);

  let attempt = 0;
  for (;;) {
    attempt += 1;
    freePort3001();

    log(`Starting next (attempt ${attempt}): next dev --webpack -p ${PORT}`);
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["next", "dev", "--webpack", "-p", String(PORT)],
      {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      },
    );

    const exitInfo = await new Promise((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
      child.on("error", (err) => resolve({ code: 1, signal: null, error: err }));
    });

    const why =
      exitInfo.error != null
        ? `spawn error: ${exitInfo.error.message}`
        : exitInfo.signal
          ? `signal ${exitInfo.signal}`
          : `exit code ${exitInfo.code}`;

    log(`next exited (${why}). Restarting in 1s…`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

if (daemon) {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const out = openSync(logPath, "a");
  const child = spawn(process.execPath, [scriptPath], {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
    env: process.env,
  });
  child.unref();
  savePid(child.pid);
  console.log(stamp(`Daemon started pid=${child.pid}`));
  console.log(stamp(`URL: http://localhost:${PORT}`));
  console.log(stamp(`Log: ${logPath}`));
  console.log(stamp("Shell can exit safely — supervisor is detached."));
  process.exit(0);
}

runLoop().catch((err) => {
  console.error(err);
  process.exit(1);
});
