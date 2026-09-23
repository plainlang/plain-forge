#!/usr/bin/env node
//
// Report whether the plain-forge installed on this machine is the latest
// published version.
//
//   node check-forge-version.mjs            # human-readable report
//   node check-forge-version.mjs --json     # machine-readable report
//   node check-forge-version.mjs --offline  # skip the registry, list installs only
//
// Exit codes (the verdict is also the first line of stdout):
//   0  PASS   — every install found is at the latest version
//   1  FAIL   — at least one install is behind the latest version
//   2  WARN   — installs found, but at least one version is indeterminate
//   3  ERROR  — the latest version could not be resolved from npm
//   4  NONE   — no plain-forge install found in any candidate directory
//
// Zero dependencies, Node >= 18 (global fetch). The install-path model and the
// version comparison mirror bin/cli.mjs; keep them in sync with that file.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const PKG = "plain-forge";
const REGISTRY = `https://registry.npmjs.org/${PKG}/latest`;
const MANIFEST_REL = path.join(".plain-forge", "manifest.json");

// Flagship skills every install ships. All four present means plain-forge is
// installed even when no manifest is (a legacy, pre-manifest install).
const SIGNATURE_SKILLS = [
  "forge-plain",
  "add-feature",
  "debug-specs",
  "load-plain-reference",
];

// The install this script is executing from, found by walking up its own path
// rather than trusting cwd:
//   <baseDir>/skills/check-forge-version/scripts/check-forge-version.mjs
// Without this, running the script from its own directory (the natural reading
// of "node scripts/check-forge-version.mjs") would scan the skill folder as if
// it were a project root and report NONE while sitting inside a live install.
// Returns null when running from the source repo, where forge/ is not an
// install.
function selfInstall() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  if (path.basename(path.resolve(here, "..", "..")) !== "skills") return null;
  const dir = path.resolve(here, "..", "..", "..");
  const byDir = {
    ".claude": "claude",
    ".agents": "codex/copilot/universal",
    ".forge": "forgecode",
    forge: "forgecode",
    ".opencode": "opencode",
    opencode: "opencode",
  };
  const agent = byDir[path.basename(dir)];
  if (!agent) return null;
  // The source repo's forge/ dir also holds skills/, and ForgeCode's global
  // install is ~/forge — same basename. Only the source tree sits next to the
  // package's own package.json, so that is what separates them. Without this
  // guard, running from a checkout reports the repo as an unmanaged install.
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "..", "package.json"), "utf8"),
    );
    if (pkg?.name === PKG) return null;
  } catch {
    /* no sibling package.json -> a real install, not the source tree */
  }
  return { agent, scope: "self", dir };
}

// Every directory plain-forge can install into, mirroring resolveBaseDir in
// bin/cli.mjs — including the two global paths that break the usual pattern
// (ForgeCode uses ~/forge, OpenCode uses ~/.config/opencode). The install this
// script lives in comes first so it survives realpath deduplication.
function candidateInstalls() {
  const cwd = process.cwd();
  const home = os.homedir();
  const self = selfInstall();
  return [
    ...(self ? [self] : []),
    { agent: "claude", scope: "project", dir: path.join(cwd, ".claude") },
    { agent: "codex/copilot/universal", scope: "project", dir: path.join(cwd, ".agents") },
    { agent: "forgecode", scope: "project", dir: path.join(cwd, ".forge") },
    { agent: "opencode", scope: "project", dir: path.join(cwd, ".opencode") },
    { agent: "claude", scope: "global", dir: path.join(home, ".claude") },
    { agent: "codex/copilot/universal", scope: "global", dir: path.join(home, ".agents") },
    { agent: "forgecode", scope: "global", dir: path.join(home, "forge") },
    { agent: "opencode", scope: "global", dir: path.join(home, ".config", "opencode") },
  ];
}

function readManifest(baseDir) {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(baseDir, MANIFEST_REL), "utf8"),
    );
    if (data && Array.isArray(data.files)) return data;
  } catch {
    /* missing or malformed manifest -> treat as absent */
  }
  return null;
}

function hasForgeSignature(baseDir) {
  return SIGNATURE_SKILLS.every((skill) =>
    fs.existsSync(path.join(baseDir, "skills", skill)),
  );
}

// Same semantics as compareVersions in bin/cli.mjs: 1 if a > b, -1 if a < b,
// 0 if equal, null when either side is not purely dotted-numeric (a
// prerelease such as "1.0.21-rc.1", or "unknown").
function compareVersions(a, b) {
  const parse = (v) => String(v).split(".").map(Number);
  const pa = parse(a);
  const pb = parse(b);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// Resolve the `latest` dist-tag. Prereleases are published under `next`, so
// `latest` is the right tag to compare a normal install against.
async function resolveLatest() {
  try {
    const res = await fetch(REGISTRY, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`registry returned HTTP ${res.status}`);
    const version = (await res.json())?.version;
    if (!version) throw new Error("registry response had no version field");
    return { version, source: "registry" };
  } catch (registryErr) {
    // Offline, proxied, or air-gapped hosts often still have a working npm
    // configured against an internal mirror.
    try {
      const out = execFileSync("npm", ["view", PKG, "version"], {
        encoding: "utf8",
        timeout: 20000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const version = out.trim();
      if (!version) throw new Error("npm view printed nothing");
      return { version, source: "npm view" };
    } catch (npmErr) {
      return {
        version: null,
        source: null,
        error: `${registryErr.message}; npm fallback: ${npmErr.message}`,
      };
    }
  }
}

function findInstalls() {
  const installs = [];
  const seen = new Set();
  for (const cand of candidateInstalls()) {
    if (!fs.existsSync(cand.dir)) continue;
    const key = fs.realpathSync(cand.dir);
    if (seen.has(key)) continue; // .agents is shared by three agent labels
    const manifest = readManifest(cand.dir);
    if (manifest) {
      seen.add(key);
      installs.push({
        ...cand,
        // The manifest records which agent layout produced the install; prefer
        // it over the label the candidate list guessed.
        agent: manifest.agent ?? cand.agent,
        installed: manifest.version ?? null,
        managed: true,
        files: manifest.files.length,
      });
    } else if (hasForgeSignature(cand.dir)) {
      seen.add(key);
      installs.push({
        ...cand,
        installed: null,
        managed: false,
        files: null,
      });
    }
  }
  return installs;
}

function classify(install, latest) {
  if (!install.managed) return "UNMANAGED";
  if (!install.installed) return "INDETERMINATE";
  const cmp = compareVersions(latest, install.installed);
  if (cmp === null) return "INDETERMINATE";
  if (cmp > 0) return "STALE";
  return "CURRENT"; // equal, or ahead of the registry (a local dev build)
}

// Greedy wrap so the report reads as prose in a terminal instead of breaking
// mid-sentence at hardcoded string boundaries.
function wrap(text, width = 84) {
  const out = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

function report(installs, latest, statuses) {
  const lines = [];
  const stale = statuses.filter((s) => s.status === "STALE");
  const unclear = statuses.filter(
    (s) => s.status === "UNMANAGED" || s.status === "INDETERMINATE",
  );

  let verdict;
  if (stale.length > 0) verdict = "FAIL";
  else if (unclear.length > 0) verdict = "WARN";
  else verdict = "PASS";

  lines.push(
    `${verdict} — latest ${PKG} on npm is v${latest.version} (via ${latest.source})`,
  );
  lines.push("");
  lines.push(`Found ${installs.length} install(s):`);
  for (const s of statuses) {
    const where = `${s.install.agent} (${s.install.scope})`;
    const version = s.install.installed ? `v${s.install.installed}` : "version unknown";
    lines.push(`  [${s.status}] ${where} — ${version}`);
    lines.push(`      ${s.install.dir}`);
    if (s.status === "UNMANAGED") {
      lines.push(
        "      no .plain-forge/manifest.json — a pre-manifest install; update adopts it",
      );
    }
  }
  lines.push("");
  if (verdict === "PASS") {
    lines.push("Every install is at the latest published version. Nothing to do.");
    return { text: lines.join("\n"), verdict };
  }

  lines.push("ACTION REQUIRED — please update plain-forge before continuing.");
  lines.push("");
  if (stale.length > 0) {
    const n = stale.length;
    lines.push(
      ...wrap(
        `${n} ${n === 1 ? "install is" : "installs are"} behind v${latest.version}. ` +
          "Continuing on an outdated plain-forge is not recommended: its skills and rules have " +
          "been superseded, so specs authored against them may not match what the current " +
          "renderer expects, and fixes released since this version are not in effect.",
      ),
    );
  }
  if (unclear.length > 0) {
    const n = unclear.length;
    if (stale.length > 0) lines.push("");
    lines.push(
      ...wrap(
        `${n} ${n === 1 ? "install could" : "installs could"} not be confirmed as current. ` +
          "Treat it as outdated until proven otherwise — updating is the cheapest way to " +
          "remove the doubt.",
      ),
    );
  }
  lines.push("");
  lines.push("    npx plain-forge update");
  lines.push("");
  lines.push(
    ...wrap(
      "One run covers everything: update auto-detects every install across both scopes, prunes " +
        "files that no longer ship, and never touches your own or third-party skills. Re-run " +
        "this check afterwards to confirm.",
    ),
  );
  return { text: lines.join("\n"), verdict };
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const offline = argv.includes("--offline");

  const installs = findInstalls();

  if (installs.length === 0) {
    const msg =
      `NONE — no ${PKG} install found.\n\n` +
      "Checked these directories (none held a .plain-forge/manifest.json or a\n" +
      "recognizable forge skill tree):\n" +
      candidateInstalls().map((c) => `  ${c.dir}`).join("\n") +
      `\n\nInstall it with:\n\n    npx ${PKG} install\n`;
    console.log(asJson ? JSON.stringify({ verdict: "NONE", installs: [] }, null, 2) : msg);
    process.exit(4);
  }

  if (offline) {
    const out = installs
      .map(
        (i) =>
          `  ${i.agent} (${i.scope}) — ${i.installed ? `v${i.installed}` : "version unknown"}\n      ${i.dir}`,
      )
      .join("\n");
    console.log(
      asJson
        ? JSON.stringify({ verdict: "OFFLINE", installs }, null, 2)
        : `OFFLINE — registry not queried.\n\nFound ${installs.length} install(s):\n${out}\n`,
    );
    process.exit(0);
  }

  const latest = await resolveLatest();
  if (!latest.version) {
    const out = installs
      .map(
        (i) =>
          `  ${i.agent} (${i.scope}) — ${i.installed ? `v${i.installed}` : "version unknown"}`,
      )
      .join("\n");
    const msg =
      `ERROR — could not resolve the latest ${PKG} version from npm.\n\n` +
      `Reason: ${latest.error}\n\n` +
      `Installed versions found (not compared against anything):\n${out}\n\n` +
      "Re-run when the network is available, or check https://www.npmjs.com/package/" +
      `${PKG} manually.\n`;
    console.error(
      asJson
        ? JSON.stringify({ verdict: "ERROR", error: latest.error, installs }, null, 2)
        : msg,
    );
    process.exit(3);
  }

  const statuses = installs.map((install) => ({
    install,
    status: classify(install, latest.version),
  }));

  const { text, verdict } = report(installs, latest, statuses);
  console.log(
    asJson
      ? JSON.stringify({ verdict, latest: latest.version, source: latest.source, installs: statuses }, null, 2)
      : text,
  );
  process.exit(verdict === "FAIL" ? 1 : verdict === "WARN" ? 2 : 0);
}

main().catch((err) => {
  console.error(`ERROR — check-forge-version failed unexpectedly: ${err.message}`);
  process.exit(3);
});
