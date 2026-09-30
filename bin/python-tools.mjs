// Installs plain-parser, the Python CLI `plain-healthcheck` uses to validate
// `.plain` files, together with uv, the tool that installs it.
//
// Temporary: once plain-parser ships as an npm package it becomes a regular
// dependency in package.json and this file goes away.
//
// Nothing here throws. A failed step prints a warning with the manual
// commands, and the plain-forge install carries on.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLAIN_PARSER = "plain-parser";

const DOWNLOAD_UV = path.join(path.dirname(fileURLToPath(import.meta.url)), "download-uv.mjs");
const UV_RELEASES = "https://github.com/astral-sh/uv/releases/latest/download";
// uv release targets per `${platform}-${arch}`. The Linux builds are static
// musl binaries, so they run on glibc and musl (Alpine) hosts alike.
const UV_TARGETS = {
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
};

const UV_INSTALLERS = {
  win32: {
    cmd: "powershell.exe",
    args: [
      "-NoProfile",
      "-ExecutionPolicy",
      "ByPass",
      "-Command",
      "irm https://astral.sh/uv/install.ps1 | iex",
    ],
    manual:
      'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"',
  },
  // Linux and macOS. Falls back to wget where curl is missing (minimal images).
  posix: {
    cmd: "sh",
    args: [
      "-c",
      "if command -v curl >/dev/null 2>&1; then curl -LsSf https://astral.sh/uv/install.sh | sh; " +
        "elif command -v wget >/dev/null 2>&1; then wget -qO- https://astral.sh/uv/install.sh | sh; " +
        'else echo "the uv installer needs curl or wget, and neither is installed" >&2; exit 1; fi',
    ],
    manual: "curl -LsSf https://astral.sh/uv/install.sh | sh",
  },
};

function uvManual(platform) {
  return platform === "win32" ? UV_INSTALLERS.win32.manual : UV_INSTALLERS.posix.manual;
}

// Where the uv installer puts uv, unless told otherwise.
function uvInstallDir(env, home) {
  return env.UV_INSTALL_DIR || env.XDG_BIN_HOME || path.join(home, ".local", "bin");
}

// The ways to install uv, tried in order. On Linux and macOS, uv is first
// downloaded with Node itself (download-uv.mjs), which needs neither curl/wget
// nor system CA certificates; astral's install.sh is the fallback for
// platforms without a known release target, or when that download fails.
function uvInstallers(platform, arch, env, home) {
  if (platform === "win32") return [UV_INSTALLERS.win32];
  const target = UV_TARGETS[`${platform}-${arch}`];
  const download = target && {
    cmd: process.execPath,
    args: [DOWNLOAD_UV, `${UV_RELEASES}/uv-${target}.tar.gz`, uvInstallDir(env, home)],
  };
  return [download, UV_INSTALLERS.posix].filter(Boolean);
}

// Run a command. `inherit` streams its output to the user; otherwise stdout is
// captured. `error` is set (ENOENT) when the command is not on PATH.
function runCommand(cmd, args, { inherit = false } = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  return { status: r.status, stdout: r.stdout ?? "", error: r.error };
}

function isOnPath(cmd, run) {
  const r = run(cmd, ["--help"]);
  return !r.error && r.status === 0;
}

// Where the uv installer puts uv. A fresh install is not on this process's
// PATH, so look for it here before giving up.
function uvCandidates(platform, env, home) {
  const exe = platform === "win32" ? "uv.exe" : "uv";
  const dirs = [
    env.UV_INSTALL_DIR,
    env.XDG_BIN_HOME,
    path.join(home, ".local", "bin"),
    path.join(home, ".cargo", "bin"),
  ].filter(Boolean);
  return dirs.map((d) => path.join(d, exe));
}

function findUv({ platform, env, home, run, exists }) {
  if (isOnPath("uv", run)) return "uv";
  return uvCandidates(platform, env, home).find(exists) ?? null;
}

function warnOffPath(log, binDir, platform) {
  log(`  plain-parser: installed${binDir ? ` into ${binDir}` : ""}, which is not on your PATH yet.`);
  if (binDir && platform !== "win32") {
    log(`  add it to PATH for this shell with:`);
    log(`    export PATH="${binDir}:$PATH"`);
    log(`  and run "uv tool update-shell" to make that permanent for new terminals.`);
  } else {
    log(`  run "uv tool update-shell" and open a new terminal.`);
  }
  return { status: "not-on-path" };
}

function warnManual(log, reason, platform) {
  log(`  plain-parser: not installed — ${reason}`);
  log(`  plain-forge's healthcheck needs it. Install it yourself with:`);
  log(`    ${uvManual(platform)}`);
  log(`    uv tool install ${PLAIN_PARSER}`);
}

// Make sure `plain-parser` is installed, installing uv first if needed.
// Returns { status } — "present", "installed", "not-on-path", or "failed".
function ensurePlainParser({
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  home = os.homedir(),
  run = runCommand,
  exists = fs.existsSync,
  log = console.log,
} = {}) {
  if (isOnPath(PLAIN_PARSER, run)) {
    log(`  plain-parser: already installed`);
    return { status: "present" };
  }

  let uv = findUv({ platform, env, home, run, exists });
  if (!uv) {
    log(`  uv: not found — installing it (https://docs.astral.sh/uv/)`);
    for (const { cmd, args } of uvInstallers(platform, arch, env, home)) {
      const r = run(cmd, args, { inherit: true });
      uv = !r.error && r.status === 0 ? findUv({ platform, env, home, run, exists }) : null;
      if (uv) break;
    }
    if (!uv) {
      warnManual(log, "installing uv failed", platform);
      return { status: "failed" };
    }
  }

  // Installed by an earlier run, but its bin dir is not on PATH.
  const binDir = run(uv, ["tool", "dir", "--bin"]).stdout.trim();
  const exe = platform === "win32" ? `${PLAIN_PARSER}.exe` : PLAIN_PARSER;
  if (binDir && exists(path.join(binDir, exe))) return warnOffPath(log, binDir, platform);

  log(`  plain-parser: not found — installing it with uv`);
  // uv downloads a suitable Python (3.11+) itself when the host has none.
  const r = run(uv, ["tool", "install", PLAIN_PARSER], { inherit: true });
  if (r.error || r.status !== 0) {
    warnManual(log, "`uv tool install plain-parser` failed", platform);
    return { status: "failed" };
  }

  if (isOnPath(PLAIN_PARSER, run)) {
    log(`  plain-parser: installed`);
    return { status: "installed" };
  }
  return warnOffPath(log, binDir, platform);
}

export { ensurePlainParser, uvInstallers, uvCandidates };
