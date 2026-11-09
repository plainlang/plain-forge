#!/usr/bin/env node
//
// Deterministic state for the `capture` skill: what a host looks like, and
// what changed in a captured unit since it was last captured.
//
//   node capture-state.mjs inventory [--root <dir>] [--depth <n>] [--under <folder>] [--paths <p>...]
//   node capture-state.mjs status    [--manifest <file>] [--unit <id>]
//   node capture-state.mjs snapshot  --unit <id> [--manifest <file>] [--revert] [--paths <p>...]
//
// inventory  Facts about the host at HEAD: commit, tracked files by directory
//            (two levels by default; --under narrows to one folder and counts
//            levels from there), dependency manifests, test and migration
//            folders, CI, languages.
// status     Compares every captured unit with its recorded file hashes and
//            classifies each change, and lists every copy under
//            plain/resources/host/ that no longer matches its host file.
//            Writes nothing.
// snapshot   Records the current hashes of a unit's files (all of them, or the
//            given --paths). With --revert, also records that the given paths
//            keep their hand edits only until the next render replaces them.
//            Advances `last_captured` to HEAD once every file of the unit
//            matches its record.
//
// The manifest defaults to plain/capture.json at the root of the git work
// tree that contains the current directory. Paths in it use forward slashes
// and are relative to the host root; `render_map[].from` is relative to the
// manifest's own folder.
//
// Exit codes:
//   0  inventory and snapshot succeeded; status found every unit up to date
//   1  status found at least one unit that needs attention
//   2  usage, environment, or manifest error (message on stderr)
//
// Zero dependencies, Node >= 22, git on PATH.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MANIFEST_VERSION = 1;
// The recorded "hash" of a file the user chose to have restored by the next render.
const DELETED = "deleted";
const OUTSIDE_SAMPLE = 20;
// Folders whose uncommitted files are not work in progress on the host: the ***plain project and the
// agent folders plain-forge installs into.
const NOT_HOST_WORK = ["plain/", ".claude/", ".agents/", ".forge/", ".opencode/"];
const MAX_LINE_COUNT_BYTES = 2 * 1024 * 1024;

const MANIFEST_FILES = new Set([
  "package.json", "pyproject.toml", "requirements.txt", "setup.py", "Pipfile",
  "Gemfile", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts",
  "composer.json", "mix.exs", "pubspec.yaml", "Package.swift", "deno.json",
]);
const RUNTIME_FILES = new Set([
  "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml",
  "Procfile", "Makefile",
]);
const TEST_SEGMENTS = new Set(["test", "tests", "spec", "specs", "__tests__", "testing"]);
const TEST_FILE = /(^test_.*\.py$|_test\.(py|go)$|\.(test|spec)\.[cm]?[jt]sx?$|_spec\.rb$|Test\.(java|kt)$|Tests?\.cs$)/;
const MIGRATION_SEGMENTS = new Set(["migrations", "migrate", "alembic", "flyway", "liquibase"]);
const CI_FILE = /^(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml|Jenkinsfile|bitbucket-pipelines\.yml)$/;

class UsageError extends Error {}

// ---------- git ----------

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : err.message;
    throw new UsageError(`git ${args[0]} failed in ${root}: ${stderr}`);
  }
}

function gitOk(root, args) {
  try {
    execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function toplevel(dir) {
  if (!gitOk(dir, ["rev-parse", "--is-inside-work-tree"])) {
    throw new UsageError(`${dir} is not inside a git work tree; capture needs git.`);
  }
  return git(dir, ["rev-parse", "--show-toplevel"]).trim();
}

function head(root) {
  if (!gitOk(root, ["rev-parse", "--verify", "--quiet", "HEAD"])) return null;
  return git(root, ["rev-parse", "HEAD"]).trim();
}

// Every tracked or untracked-but-not-ignored file under root, relative to root.
// Submodules and nested repositories are listed by git as folders; they are not
// files of this host and are skipped.
function listFiles(root) {
  const out = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  const files = new Set();
  for (const f of out.split("\0")) {
    if (!f || f.endsWith("/")) continue;
    let st;
    try {
      st = fs.lstatSync(path.join(root, f));
    } catch {
      continue;
    }
    if (st.isFile() || st.isSymbolicLink()) files.add(f);
  }
  return [...files].sort();
}

// Paths with uncommitted changes (staged, unstaged, untracked), relative to root.
function dirtyFiles(root) {
  const prefix = git(root, ["rev-parse", "--show-prefix"]).trim();
  const tokens = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0");
  const dirty = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry) continue;
    const paths = [entry.slice(3)];
    if (entry[0] === "R" || entry[0] === "C") paths.push(tokens[++i]);
    for (const p of paths) {
      if (p && p.startsWith(prefix)) dirty.add(p.slice(prefix.length));
    }
  }
  return dirty;
}

function changedSince(root, commit) {
  const out = git(root, ["diff", "--name-only", "--relative", "-z", `${commit}..HEAD`]);
  return out.split("\0").filter(Boolean);
}

// ---------- paths and hashes ----------

function normalizePrefix(p) {
  let s = String(p).replaceAll("\\", "/").replace(/^\.\//, "");
  if (s === "." || s === "./") s = "";
  return s;
}

function under(file, prefix) {
  if (prefix === "") return true;
  if (prefix.endsWith("/")) return file.startsWith(prefix);
  return file === prefix || file.startsWith(prefix + "/");
}

function underAny(file, prefixes) {
  return prefixes.some((p) => under(file, p));
}

function hashFile(abs) {
  const st = fs.lstatSync(abs);
  const h = crypto.createHash("sha256");
  if (st.isSymbolicLink()) h.update("symlink:" + fs.readlinkSync(abs));
  else h.update(fs.readFileSync(abs));
  return h.digest("hex");
}

// ---------- manifest ----------

function defaultManifest() {
  return path.join(toplevel(process.cwd()), "plain", "capture.json");
}

function readManifest(file) {
  if (!fs.existsSync(file)) throw new UsageError(`No capture manifest at ${file}.`);
  let m;
  try {
    m = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new UsageError(`${file} is not valid JSON: ${err.message}`);
  }
  if (m.version !== MANIFEST_VERSION) {
    throw new UsageError(`${file}: unsupported version ${m.version} (expected ${MANIFEST_VERSION}).`);
  }
  if (!Array.isArray(m.units)) throw new UsageError(`${file}: "units" must be an array.`);
  const ids = new Set();
  for (const u of m.units) {
    if (!u || typeof u.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(u.id)) {
      throw new UsageError(`${file}: every unit needs a kebab-case "id".`);
    }
    if (ids.has(u.id)) throw new UsageError(`${file}: unit "${u.id}" is listed twice.`);
    ids.add(u.id);
    if (typeof u.module !== "string" || !u.module) {
      throw new UsageError(`${file}: unit "${u.id}" needs a "module".`);
    }
    if (!Array.isArray(u.paths) || u.paths.length === 0) {
      throw new UsageError(`${file}: unit "${u.id}" needs a non-empty "paths" array.`);
    }
    for (const key of ["paths", "exclude", "boundary"]) {
      const v = u[key];
      if (v !== undefined && !(Array.isArray(v) && v.every((p) => typeof p === "string"))) {
        throw new UsageError(`${file}: "${key}" of unit "${u.id}" must be an array of paths.`);
      }
    }
    if (u.render_map !== undefined && !(Array.isArray(u.render_map) &&
        u.render_map.every((r) => r && typeof r.from === "string" && typeof r.to === "string"))) {
      throw new UsageError(`${file}: "render_map" of unit "${u.id}" must be an array of {"from", "to"} paths.`);
    }
    if (u.functionalities !== undefined && !(u.functionalities && typeof u.functionalities === "object" &&
        !Array.isArray(u.functionalities) && Object.values(u.functionalities).every(Array.isArray))) {
      throw new UsageError(`${file}: "functionalities" of unit "${u.id}" must map each func-id to an array of paths.`);
    }
    checkAnswers(file, u.answers, `unit "${u.id}"`);
  }
  checkAnswers(file, m.answers, "the project");
  return m;
}

// Every answer the user gave, so a capture resumed in another session neither re-asks nor loses it.
function checkAnswers(file, answers, owner) {
  if (answers === undefined) return;
  if (!Array.isArray(answers)) throw new UsageError(`${file}: "answers" of ${owner} must be an array.`);
  for (const a of answers) {
    if (!a || typeof a.topic !== "string" || !a.topic || typeof a.answer !== "string" || !a.answer) {
      throw new UsageError(`${file}: every answer of ${owner} needs a non-empty "topic" and "answer".`);
    }
  }
}

function sortedObject(obj) {
  const out = {};
  for (const k of Object.keys(obj ?? {}).sort()) out[k] = obj[k];
  return out;
}

// Canonical key order so that writing the same state twice is byte-identical.
function canonicalUnit(u) {
  const functionalities = {};
  for (const [k, v] of Object.entries(sortedObject(u.functionalities))) {
    functionalities[k] = [...v].map(normalizePrefix).sort();
  }
  return {
    id: u.id,
    module: u.module,
    status: u.status ?? "capturing",
    intent: u.intent ?? null,
    answers: (u.answers ?? []).map(canonicalAnswer),
    paths: [...u.paths].map(normalizePrefix).sort(),
    exclude: [...(u.exclude ?? [])].map(normalizePrefix).sort(),
    boundary: [...(u.boundary ?? [])].map(normalizePrefix).sort(),
    render_map: [...(u.render_map ?? [])]
      .map((r) => ({ from: normalizePrefix(r.from), to: normalizePrefix(r.to) }))
      .sort((a, b) => a.to.localeCompare(b.to)),
    functionalities,
    last_captured: u.last_captured ?? null,
    files: sortedObject(u.files),
    decisions: sortedObject(u.decisions),
  };
}

// Answers keep the order they were given in: it is the history of the capture.
function canonicalAnswer(a) {
  return { topic: a.topic, question: a.question ?? null, answer: a.answer, commit: a.commit ?? null };
}

function writeManifest(file, m) {
  const out = {
    version: MANIFEST_VERSION,
    host_root: m.host_root ?? "..",
    answers: (m.answers ?? []).map(canonicalAnswer),
    scan: m.scan ?? null,
    units: m.units.map(canonicalUnit).sort((a, b) => a.id.localeCompare(b.id)),
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}

function hostRootOf(manifestFile, m) {
  return path.resolve(path.dirname(manifestFile), m.host_root ?? "..");
}

// The manifest's own folder (plain/) is never part of a unit or its boundary.
function plainPrefix(root, manifestFile) {
  const rel = path.relative(root, path.dirname(manifestFile)).replaceAll("\\", "/");
  return rel && !rel.startsWith("..") ? rel + "/" : null;
}

// Files the unit owns or depends on, with their kind; unit wins over boundary.
function scopeOf(unit, files, plainDir) {
  const paths = unit.paths.map(normalizePrefix);
  const exclude = (unit.exclude ?? []).map(normalizePrefix);
  const boundary = (unit.boundary ?? []).map(normalizePrefix);
  const scope = new Map();
  for (const f of files) {
    if (plainDir && f.startsWith(plainDir)) continue;
    if (underAny(f, paths) && !underAny(f, exclude)) scope.set(f, "unit");
    else if (underAny(f, boundary)) scope.set(f, "boundary");
  }
  return scope;
}

// Whether a path falls under the unit's or its boundary's prefixes, whether or not the file exists.
function inUnitScope(unit, file, plainDir) {
  if (plainDir && file.startsWith(plainDir)) return false;
  const paths = unit.paths.map(normalizePrefix);
  const exclude = (unit.exclude ?? []).map(normalizePrefix);
  const boundary = (unit.boundary ?? []).map(normalizePrefix);
  return (underAny(file, paths) && !underAny(file, exclude)) || underAny(file, boundary);
}

function kindOfRecorded(unit, file) {
  const paths = unit.paths.map(normalizePrefix);
  const exclude = (unit.exclude ?? []).map(normalizePrefix);
  return underAny(file, paths) && !underAny(file, exclude) ? "unit" : "boundary";
}

// ---------- status ----------

const SKIP_DIRS = new Set(["plain_modules", "dist", "node_modules"]);

// Newest modification time of the files under dir (optionally only those ending in ext), or 0.
function newestMtime(dir, ext, skip = new Set()) {
  let newest = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || skip.has(e.name)) continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && (!ext || e.name.endsWith(ext))) newest = Math.max(newest, fs.statSync(abs).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

// A change that matches the render output came from the specs only if that render is not older than
// the specs; a render made before the last spec edit is stale and its match proves nothing.
function originOf(unit, file, change, root, manifestDir, times) {
  const maps = (unit.render_map ?? []).map((r) => ({
    from: normalizePrefix(r.from),
    to: normalizePrefix(r.to),
  }));
  if (maps.length === 0) return "edited";
  const map = maps.find((r) => under(file, r.to));
  if (!map) return "edited";
  const renderRoot = path.join(manifestDir, map.from);
  if (!fs.existsSync(renderRoot)) return "unknown";
  const rel = map.to === "" ? file : file.slice(map.to.replace(/\/?$/, "/").length);
  const rendered = path.join(renderRoot, rel);
  let matches;
  if (change === "deleted") matches = !fs.existsSync(rendered);
  else matches = fs.existsSync(rendered) && hashFile(rendered) === hashFile(path.join(root, file));
  if (!matches) return "edited";
  times.specs ??= newestMtime(manifestDir, ".plain", SKIP_DIRS);
  times.renders[renderRoot] ??= newestMtime(renderRoot);
  return times.renders[renderRoot] < times.specs ? "stale-render" : "rendered";
}

function funcIdsOf(unit, file) {
  const ids = [];
  for (const [id, sources] of Object.entries(unit.functionalities ?? {})) {
    if (sources.some((s) => under(file, normalizePrefix(s)))) ids.push(id);
  }
  return ids.sort();
}

function unitStatus(unit, root, manifestFile, files, dirty, commit) {
  // Before its first snapshot a unit has no record to compare with: every file
  // would read as added, which says nothing.
  if (!unit.last_captured && Object.keys(unit.files ?? {}).length === 0) {
    return {
      id: unit.id,
      module: unit.module,
      state: "capturing",
      last_captured: null,
      last_captured_reachable: null,
      head: commit,
      unit_changes: [],
      boundary_changes: [],
      uncommitted: [],
      awaiting_render: [],
      outside: null,
    };
  }
  const manifestDir = path.dirname(manifestFile);
  const plainDir = plainPrefix(root, manifestFile);
  const scope = scopeOf(unit, files, plainDir);
  const recorded = unit.files ?? {};
  const current = new Map();
  for (const f of scope.keys()) current.set(f, hashFile(path.join(root, f)));

  const times = { specs: undefined, renders: {} };
  const unitChanges = [];
  const boundaryChanges = [];
  const all = new Set([...current.keys(), ...Object.keys(recorded)]);
  for (const f of [...all].sort()) {
    const now = current.get(f);
    const was = recorded[f];
    let change = null;
    if (now && !was) change = "added";
    else if (!now && was) change = "deleted";
    else if (now && was && now !== was.hash) change = "modified";
    if (!change) continue;
    const kind = scope.get(f) ?? kindOfRecorded(unit, f);
    const item = { path: f, change, since: was?.commit ?? null };
    if (kind === "unit") {
      item.origin = originOf(unit, f, change, root, manifestDir, times);
      item.func_ids = funcIdsOf(unit, f);
      unitChanges.push(item);
    } else {
      boundaryChanges.push(item);
    }
  }

  // Includes uncommitted deletions, which are in neither the scope nor the record.
  const uncommitted = [...dirty].filter((f) => inUnitScope(unit, f, plainDir)).sort();

  const awaitingRender = Object.entries(unit.decisions ?? {})
    .filter(([f, d]) => d.decision === "revert" &&
      (current.has(f) ? current.get(f) === d.hash : d.hash === DELETED))
    .map(([f]) => f)
    .sort();

  let reachable = null;
  let outside = null;
  if (unit.last_captured) {
    reachable = gitOk(root, ["cat-file", "-e", `${unit.last_captured}^{commit}`]);
    if (reachable && commit) {
      const changed = changedSince(root, unit.last_captured).filter(
        (f) => !scope.has(f) && !recorded[f] && !(plainDir && f.startsWith(plainDir)),
      );
      outside = { count: changed.length, sample: changed.slice(0, OUTSIDE_SAMPLE) };
    }
  }

  let state;
  if (uncommitted.length > 0) state = "uncommitted";
  else if (unitChanges.length > 0 || boundaryChanges.length > 0) state = "changed";
  else state = "up-to-date";

  return {
    id: unit.id,
    module: unit.module,
    state,
    last_captured: unit.last_captured ?? null,
    last_captured_reachable: reachable,
    head: commit,
    unit_changes: unitChanges,
    boundary_changes: boundaryChanges,
    uncommitted,
    awaiting_render: awaitingRender,
    outside,
  };
}

// Host files are copied to plain/resources/host/<host path> so the renderer,
// which receives only plain/, sees them. A copy that no longer matches its host
// file is stale; one whose host file is gone has lost its source.
function staleCopies(root, manifestFile) {
  const copiesRoot = path.join(path.dirname(manifestFile), "resources", "host");
  if (!fs.existsSync(copiesRoot)) return [];
  const stale = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) {
        const rel = path.relative(copiesRoot, abs).replaceAll("\\", "/");
        const source = path.join(root, rel);
        let st = null;
        try {
          st = fs.lstatSync(source);
        } catch {
          // no source file
        }
        if (!st || !(st.isFile() || st.isSymbolicLink())) stale.push({ path: rel, issue: "source-missing" });
        else if (hashFile(source) !== hashFile(abs)) stale.push({ path: rel, issue: "differs" });
      }
    }
  };
  walk(copiesRoot);
  return stale.sort((a, b) => a.path.localeCompare(b.path));
}

function cmdStatus(opts) {
  const manifestFile = path.resolve(opts.manifest ?? defaultManifest());
  const m = readManifest(manifestFile);
  const root = hostRootOf(manifestFile, m);
  const commit = head(root);
  const files = listFiles(root);
  const dirty = dirtyFiles(root);
  const units = m.units.filter((u) => !opts.unit || u.id === opts.unit);
  if (opts.unit && units.length === 0) throw new UsageError(`No unit "${opts.unit}" in ${manifestFile}.`);
  const report = {
    manifest: manifestFile,
    host_root: root,
    head: commit,
    stale_copies: staleCopies(root, manifestFile),
    units: units.map((u) => unitStatus(u, root, manifestFile, files, dirty, commit)),
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  const settled = report.units.every((u) => u.state === "up-to-date");
  return settled && report.stale_copies.length === 0 ? 0 : 1;
}

// ---------- snapshot ----------

function cmdSnapshot(opts) {
  if (!opts.unit) throw new UsageError("snapshot needs --unit <id>.");
  const manifestFile = path.resolve(opts.manifest ?? defaultManifest());
  const m = readManifest(manifestFile);
  const unit = m.units.find((u) => u.id === opts.unit);
  if (!unit) throw new UsageError(`No unit "${opts.unit}" in ${manifestFile}.`);
  const root = hostRootOf(manifestFile, m);
  const commit = head(root);
  if (!commit) throw new UsageError(`${root} has no commits; commit the host before capturing.`);

  const plainDir = plainPrefix(root, manifestFile);
  const scope = scopeOf(unit, listFiles(root), plainDir);
  const recorded = { ...(unit.files ?? {}) };
  const targets = opts.paths.length
    ? opts.paths.map(normalizePrefix)
    : [...new Set([...scope.keys(), ...Object.keys(recorded)])].sort();

  for (const t of targets) {
    if (!scope.has(t) && !recorded[t]) {
      throw new UsageError(`${t} is neither in unit "${unit.id}" nor in its boundary.`);
    }
  }
  const dirty = dirtyFiles(root);
  // A full snapshot settles the whole unit, so any uncommitted path under its prefixes blocks it —
  // including a deletion, which is in neither the scope nor the record.
  const blocked = opts.paths.length
    ? targets.filter((t) => dirty.has(t))
    : [...dirty].filter((f) => inUnitScope(unit, f, plainDir)).sort();
  if (blocked.length) {
    throw new UsageError(
      `Commit these files before snapshotting unit "${unit.id}":\n  ${blocked.join("\n  ")}`,
    );
  }

  let updated = 0;
  let removed = 0;
  const decisions = { ...(unit.decisions ?? {}) };
  for (const t of targets) {
    if (scope.has(t)) {
      const hash = hashFile(path.join(root, t));
      recorded[t] = { hash, commit };
      updated++;
      if (opts.revert) {
        if (scope.get(t) !== "unit") {
          throw new UsageError(`--revert applies to unit files only; ${t} is in the boundary.`);
        }
        decisions[t] = { hash, decision: "revert" };
      }
    } else {
      if (opts.revert) {
        if (kindOfRecorded(unit, t) !== "unit") {
          throw new UsageError(`--revert applies to unit files only; ${t} is in the boundary.`);
        }
        decisions[t] = { hash: DELETED, decision: "revert" };
      }
      delete recorded[t];
      removed++;
    }
  }

  // A revert decision lasts until the file changes again (normally: a render); for a reverted
  // deletion, until the file exists again.
  for (const [f, d] of Object.entries(decisions)) {
    const unchanged = scope.has(f) ? hashFile(path.join(root, f)) === d.hash : d.hash === DELETED;
    if (!unchanged) delete decisions[f];
  }

  const settled =
    [...scope.keys()].every((f) => recorded[f]?.hash === hashFile(path.join(root, f))) &&
    Object.keys(recorded).every((f) => scope.has(f));
  unit.files = recorded;
  unit.decisions = decisions;
  if (settled) {
    unit.last_captured = commit;
    unit.status = "captured";
  }
  writeManifest(manifestFile, m);
  const summary = {
    unit: unit.id,
    updated,
    removed,
    settled,
    last_captured: unit.last_captured ?? null,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  return 0;
}

// ---------- inventory ----------

function countLines(abs) {
  const st = fs.lstatSync(abs);
  if (!st.isFile() || st.size > MAX_LINE_COUNT_BYTES) return null;
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) return null;
  let n = 0;
  for (const b of buf) if (b === 10) n++;
  return buf.length && buf[buf.length - 1] !== 10 ? n + 1 : n;
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function cmdInventory(opts) {
  const root = path.resolve(opts.root ?? toplevel(process.cwd()));
  toplevel(root);
  const depth = opts.depth ?? 2;
  // `.` and `./` mean the whole host, so they normalize to the empty prefix.
  const underPrefix = opts.under ? normalizePrefix(opts.under) : "";
  const under = underPrefix ? underPrefix.replace(/\/?$/, "/") : "";
  const underDepth = under ? under.split("/").length - 1 : 0;
  const files = listFiles(root).filter((f) => f.startsWith(under));
  const dirs = new Map();
  const languages = new Map();
  const testDirs = new Map();
  const migrationDirs = new Map();
  const manifests = [];
  const runtime = [];
  const ci = [];
  const plain = [];
  let binary = 0;

  for (const f of files) {
    const segs = f.split("/");
    const base = segs[segs.length - 1];
    const lines = countLines(path.join(root, f));
    if (lines === null) binary++;
    for (let d = underDepth + 1; d <= Math.min(underDepth + depth, segs.length - 1); d++) {
      const key = segs.slice(0, d).join("/") + "/";
      const agg = dirs.get(key) ?? { files: 0, lines: 0 };
      agg.files++;
      agg.lines += lines ?? 0;
      dirs.set(key, agg);
    }
    const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : base;
    if (lines !== null) bump(languages, ext);
    if (MANIFEST_FILES.has(base) || /\.(csproj|fsproj|sln)$/.test(base)) manifests.push(f);
    if (RUNTIME_FILES.has(base)) runtime.push(f);
    if (CI_FILE.test(f)) ci.push(f);
    if (base.endsWith(".plain") || /(^|\/)plain\/config\.ya?ml$/.test(f)) plain.push(f);
    const testIdx = segs.findIndex((s) => TEST_SEGMENTS.has(s));
    if (testIdx >= 0) bump(testDirs, segs.slice(0, testIdx + 1).join("/") + "/");
    else if (TEST_FILE.test(base)) bump(testDirs, segs.slice(0, -1).join("/") + "/");
    const migIdx = segs.findIndex((s) => MIGRATION_SEGMENTS.has(s));
    if (migIdx >= 0) bump(migrationDirs, segs.slice(0, migIdx + 1).join("/") + "/");
  }

  const asList = (map) => [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // Uncommitted work the scan would read: plain/ and agent folders are capture's own, not the host's.
  const uncommittedWork = [...dirtyFiles(root)]
    .filter((f) => !NOT_HOST_WORK.some((p) => f.startsWith(p)))
    .sort();
  // A candidate is often a file plus a folder of the same name: total any set of prefixes.
  let pathsTotal = null;
  if (opts.paths.length) {
    const prefixes = opts.paths.map(normalizePrefix);
    pathsTotal = { paths: prefixes, files: 0, lines: 0 };
    for (const f of listFiles(root).filter((f) => underAny(f, prefixes))) {
      pathsTotal.files++;
      pathsTotal.lines += countLines(path.join(root, f)) ?? 0;
    }
  }
  const report = {
    host_root: root,
    under: under || null,
    paths_total: pathsTotal,
    head: head(root),
    uncommitted: uncommittedWork.length,
    uncommitted_sample: uncommittedWork.slice(0, OUTSIDE_SAMPLE),
    files: files.length,
    binary_or_large_files: binary,
    directories: asList(dirs).map(([p, a]) => ({ path: p, files: a.files, lines: a.lines })),
    extensions: [...languages.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([ext, count]) => ({ ext, files: count })),
    dependency_manifests: manifests,
    runtime_files: runtime,
    ci_files: ci,
    test_dirs: asList(testDirs).map(([p, n]) => ({ path: p, files: n })),
    migration_dirs: asList(migrationDirs).map(([p, n]) => ({ path: p, files: n })),
    plain_files: plain,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return 0;
}

// ---------- cli ----------

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { paths: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const value = () => {
      if (i + 1 >= rest.length) throw new UsageError(`${a} needs a value.`);
      return rest[++i];
    };
    if (a === "--root") opts.root = value();
    else if (a === "--under") opts.under = value();
    else if (a === "--depth") opts.depth = Number(value());
    else if (a === "--manifest") opts.manifest = value();
    else if (a === "--unit") opts.unit = value();
    else if (a === "--revert") opts.revert = true;
    else if (a === "--paths") {
      // An empty --paths would fall back to every file and settle unreviewed changes.
      const before = opts.paths.length;
      while (i + 1 < rest.length && !rest[i + 1].startsWith("--")) opts.paths.push(rest[++i]);
      if (opts.paths.length === before) throw new UsageError("--paths needs at least one path.");
    } else throw new UsageError(`Unknown option ${a}.`);
  }
  if (opts.depth !== undefined && !(Number.isInteger(opts.depth) && opts.depth > 0)) {
    throw new UsageError("--depth must be a positive integer.");
  }
  if (opts.revert && opts.paths.length === 0) {
    throw new UsageError("--revert needs --paths naming the reverted files.");
  }
  return { cmd, opts };
}

const USAGE = `Usage:
  capture-state.mjs inventory [--root <dir>] [--depth <n>] [--under <folder>] [--paths <p>...]
  capture-state.mjs status    [--manifest <file>] [--unit <id>]
  capture-state.mjs snapshot  --unit <id> [--manifest <file>] [--revert] [--paths <p>...]`;

export function main(argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    if (cmd === "inventory") return cmdInventory(opts);
    if (cmd === "status") return cmdStatus(opts);
    if (cmd === "snapshot") return cmdSnapshot(opts);
    throw new UsageError(cmd ? `Unknown command ${cmd}.` : "Missing command.");
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`Error: ${err.message}\n${USAGE}\n`);
      return 2;
    }
    throw err;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
