"use strict";

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const INSTALL_SCRIPT_URL = "https://cua.ai/driver/install.ps1";
const PROBE_TIMEOUT_MS = 15_000;
const INSTALL_TIMEOUT_MS = 180_000;
const BINARY = process.platform === "win32" ? "cua-driver.exe" : "cua-driver";

function candidatePaths() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const out = [];
  if (process.platform === "win32") {
    out.push(path.join(local, "Programs", "Cua", "cua-driver", "bin", BINARY));
    out.push(path.join(local, "Programs", "Cua", "cua-driver", BINARY));
    out.push(path.join(local, "Programs", "cua-driver", BINARY));
    out.push(path.join(home, ".local", "bin", BINARY));
    out.push(path.join(home, ".cua", "bin", BINARY));
  } else {
    out.push(path.join(home, ".local", "bin", BINARY));
    out.push(path.join(home, ".cua", "bin", BINARY));
    out.push(`/usr/local/bin/${BINARY}`);
    out.push(`/opt/homebrew/bin/${BINARY}`);
    out.push("/Applications/CuaDriver.app/Contents/MacOS/cua-driver");
  }
  return out;
}

function findInPath() {
  const dirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const full = path.join(dir, BINARY);
    if (fs.existsSync(full)) return full;
    if (process.platform === "win32") {
      const exe = path.join(dir, "cua-driver.exe");
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

function findBinary() {
  return findInPath() || candidatePaths().find((item) => fs.existsSync(item)) || null;
}

function runCapture(exe, args, timeoutMs) {
  const result = spawnSync(exe, args, {
    encoding: "utf8",
    timeout: timeoutMs || PROBE_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 2_000_000,
  });
  return {
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error ? result.error.message : "",
  };
}

function probe() {
  const found = findBinary();
  if (!found) {
    return {
      installed: false,
      path: null,
      version: null,
      mcpCommand: null,
      mcpArgs: ["mcp"],
      error: null,
    };
  }
  const ran = runCapture(found, ["manifest"], PROBE_TIMEOUT_MS);
  let version = null;
  let mcpCommand = found;
  let mcpArgs = ["mcp"];
  let error = null;
  if (ran.error) error = ran.error;
  else if (ran.status !== 0) error = ran.stderr || ran.stdout || `manifest exit ${ran.status}`;
  else {
    try {
      const manifest = JSON.parse(ran.stdout);
      version = manifest.binary_version || null;
      const invocation = manifest.mcp_invocation || {};
      if (invocation.command) mcpCommand = invocation.command;
      if (Array.isArray(invocation.args) && invocation.args.length) mcpArgs = invocation.args;
    } catch (err) {
      error = `failed to parse manifest: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return {
    installed: true,
    path: found,
    version,
    mcpCommand,
    mcpArgs,
    error,
  };
}

function installPreview() {
  const inner = `irm ${INSTALL_SCRIPT_URL} | iex`;
  return {
    program: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", inner],
    display: `powershell -NoProfile -Command "${inner}"`,
    sourceUrl: INSTALL_SCRIPT_URL,
  };
}

function runInstall() {
  const preview = installPreview();
  return new Promise((resolve, reject) => {
    const child = spawn(preview.program, preview.args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      out += chunk;
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error(`installer timed out after ${INSTALL_TIMEOUT_MS / 1000}s. Run:\n${preview.display}`));
    }, INSTALL_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, text: out.trim(), probe: probe() });
      else reject(new Error(out.trim() || `installer exited ${code}`));
    });
  });
}

function doctor(exe) {
  const target = exe || findBinary();
  if (!target) return { code: 1, text: "cua-driver not installed" };
  const ran = runCapture(target, ["doctor"], 20_000);
  return {
    code: ran.status == null ? 1 : ran.status,
    text: `${ran.stdout}\n${ran.stderr}`.trim() || ran.error || `doctor exited ${ran.status}`,
  };
}

module.exports = {
  INSTALL_SCRIPT_URL,
  findBinary,
  probe,
  installPreview,
  runInstall,
  doctor,
};
