import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(repoRoot, "forge", "skills", "capture", "scripts", "capture-state.mjs");

// Hermetic git: no user or system config, fixed identity, no signing.
function gitEnv(home) {
  const globalConfig = path.join(home, "gitconfig");
  fs.writeFileSync(globalConfig, "");
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
}

function makeHost() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "capture-state-"));
  const root = path.join(base, "host");
  fs.mkdirSync(root);
  const env = gitEnv(base);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
  const write = (rel, content) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  const commit = (msg) => {
    git("add", "-A");
    git("commit", "-q", "-m", msg);
    return git("rev-parse", "HEAD").trim();
  };
  git("init", "-q");
  write("package.json", '{"name":"host"}\n');
  write("src/host/app.js", "export const app = 1;\n");
  write("src/host/base.js", "export class Base {}\n");
  write("src/unit/a.js", "export const a = 1;\n");
  write("src/unit/b.js", "export const b = 2;\n");
  write("test/unit.test.js", "// tests\n");
  write("db/migrations/001.sql", "create table t (id int);\n");
  write(
    "plain/capture.json",
    JSON.stringify({
      version: 1,
      host_root: "..",
      scan: null,
      units: [
        {
          id: "unit",
          module: "unit",
          status: "capturing",
          paths: ["src/unit/"],
          boundary: ["src/host/base.js"],
          render_map: [{ from: "plain_modules/unit/code/src/unit/", to: "src/unit/" }],
          functionalities: { "make-a": ["src/unit/a.js"], "make-b": ["src/unit/b.js"] },
        },
      ],
    }),
  );
  const first = commit("initial");
  const run = (...args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, env, encoding: "utf8" });
    return { code: r.status, out: r.stdout, err: r.stderr, json: r.stdout ? safeJson(r.stdout) : null };
  };
  const manifest = () => fs.readFileSync(path.join(root, "plain", "capture.json"), "utf8");
  return { root, git, write, commit, run, manifest, first };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Snapshot the unit and commit the manifest so the host is clean again.
function capture(h) {
  const r = h.run("snapshot", "--unit", "unit");
  assert.equal(r.code, 0, r.err);
  return h.commit("capture");
}

describe("capture-state inventory", () => {
  test("reports the host's commit, folders, manifests, tests and migrations", () => {
    const h = makeHost();
    const r = h.run("inventory");
    assert.equal(r.code, 0, r.err);
    assert.equal(r.json.head, h.first);
    assert.ok(r.json.directories.some((d) => d.path === "src/unit/" && d.files === 2));
    assert.deepEqual(r.json.dependency_manifests, ["package.json"]);
    assert.deepEqual(r.json.test_dirs, [{ path: "test/", files: 1 }]);
    assert.deepEqual(r.json.migration_dirs, [{ path: "db/migrations/", files: 1 }]);
  });

  test("--under narrows the folders to one subtree, counted from there", () => {
    const h = makeHost();
    h.write("src/unit/deep/er/x.js", "x\n");
    const r = h.run("inventory", "--under", "src", "--depth", "1");
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(
      r.json.directories.map((d) => d.path),
      ["src/host/", "src/unit/"],
    );
  });

  test("--paths totals the files and lines of a candidate made of a file and a folder", () => {
    const h = makeHost();
    const r = h.run("inventory", "--paths", "src/unit/a.js", "src/host/");
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(r.json.paths_total, { paths: ["src/unit/a.js", "src/host/"], files: 3, lines: 3 });
  });

  test("skips nested repositories and symlinked folders instead of reading them", () => {
    const h = makeHost();
    const nested = path.join(h.root, "vendor", "lib");
    fs.mkdirSync(nested, { recursive: true });
    execFileSync("git", ["-C", nested, "init", "-q"]);
    fs.writeFileSync(path.join(nested, "x.js"), "x\n");
    fs.symlinkSync(path.join(h.root, "src"), path.join(h.root, "src-link"));
    const r = h.run("inventory");
    assert.equal(r.code, 0, r.err);
    assert.ok(!r.json.directories.some((d) => d.path.startsWith("vendor/")));
    assert.equal(h.run("snapshot", "--unit", "unit").code, 0);
  });

  test("fails outside a git work tree", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-nogit-"));
    const r = spawnSync(process.execPath, [SCRIPT, "inventory", "--root", dir], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not inside a git work tree/);
  });
});

describe("capture-state snapshot and status", () => {
  test("a fresh unit reports capturing until its first snapshot", () => {
    const h = makeHost();
    const r = h.run("status");
    assert.equal(r.code, 1);
    assert.equal(r.json.units[0].state, "capturing");
  });

  test("snapshot is idempotent and settles the unit", () => {
    const h = makeHost();
    assert.equal(h.run("snapshot", "--unit", "unit").code, 0);
    const once = h.manifest();
    assert.equal(h.run("snapshot", "--unit", "unit").code, 0);
    assert.equal(h.manifest(), once, "a second snapshot of the same state must not change the manifest");
    const m = JSON.parse(once);
    assert.equal(m.units[0].status, "captured");
    assert.equal(m.units[0].last_captured, h.first);
    assert.deepEqual(Object.keys(m.units[0].files), ["src/host/base.js", "src/unit/a.js", "src/unit/b.js"]);
  });

  test("an unchanged host is up to date and writes nothing", () => {
    const h = makeHost();
    capture(h);
    const before = h.manifest();
    const r = h.run("status");
    assert.equal(r.code, 0, r.out);
    assert.equal(r.json.units[0].state, "up-to-date");
    assert.equal(h.manifest(), before);
  });

  test("a committed hand edit is flagged with its func-ids and diff base", () => {
    const h = makeHost();
    capture(h);
    h.write("plain/plain_modules/unit/code/src/unit/a.js", "export const a = 1;\n");
    h.write("src/unit/a.js", "export const a = 42;\n");
    h.commit("hand edit");
    const r = h.run("status");
    assert.equal(r.code, 1);
    const u = r.json.units[0];
    assert.equal(u.state, "changed");
    assert.deepEqual(u.unit_changes, [
      { path: "src/unit/a.js", change: "modified", since: h.first, origin: "edited", func_ids: ["make-a"] },
    ]);
  });

  test("a change that matches the render output is classified as rendered", () => {
    const h = makeHost();
    capture(h);
    const rendered = "export const a = 'rendered';\n";
    h.write("plain/plain_modules/unit/code/src/unit/a.js", rendered);
    h.write("src/unit/a.js", rendered);
    h.commit("render landed");
    const u = h.run("status").json.units[0];
    assert.equal(u.unit_changes[0].origin, "rendered");
  });

  test("render origin is unknown when the render output is not on disk", () => {
    const h = makeHost();
    capture(h);
    h.write("src/unit/a.js", "export const a = 3;\n");
    h.commit("edit without render");
    assert.equal(h.run("status").json.units[0].unit_changes[0].origin, "unknown");
  });

  test("added, deleted and boundary files are reported", () => {
    const h = makeHost();
    capture(h);
    h.write("src/unit/c.js", "export const c = 3;\n");
    fs.rmSync(path.join(h.root, "src/unit/b.js"));
    h.write("src/host/base.js", "export class Base { x() {} }\n");
    h.write("src/host/app.js", "export const app = 2;\n");
    h.commit("several changes");
    const u = h.run("status").json.units[0];
    assert.deepEqual(
      u.unit_changes.map((c) => [c.path, c.change, c.func_ids]),
      [
        ["src/unit/b.js", "deleted", ["make-b"]],
        ["src/unit/c.js", "added", []],
      ],
    );
    assert.deepEqual(u.boundary_changes.map((c) => [c.path, c.change]), [["src/host/base.js", "modified"]]);
    assert.deepEqual(u.outside, { count: 1, sample: ["src/host/app.js"] });
  });

  test("uncommitted changes block the snapshot", () => {
    const h = makeHost();
    capture(h);
    h.write("src/unit/a.js", "export const a = 9;\n");
    const s = h.run("status").json.units[0];
    assert.equal(s.state, "uncommitted");
    assert.deepEqual(s.uncommitted, ["src/unit/a.js"]);
    const r = h.run("snapshot", "--unit", "unit");
    assert.equal(r.code, 2);
    assert.match(r.err, /Commit these files/);
  });

  test("a deferred change keeps last_captured and is flagged again on the next run", () => {
    const h = makeHost();
    const captured = JSON.parse((capture(h), h.manifest())).units[0].last_captured;
    h.write("src/unit/a.js", "export const a = 10;\n");
    h.write("src/unit/b.js", "export const b = 20;\n");
    h.commit("two edits");
    const r = h.run("snapshot", "--unit", "unit", "--paths", "src/unit/a.js");
    assert.equal(r.code, 0, r.err);
    assert.equal(r.json.settled, false);
    assert.equal(JSON.parse(h.manifest()).units[0].last_captured, captured);
    const again = h.run("status").json.units[0];
    assert.deepEqual(again.unit_changes.map((c) => c.path), ["src/unit/b.js"]);
  });

  test("a reverted edit awaits the render, then the decision is dropped", () => {
    const h = makeHost();
    capture(h);
    h.write("src/unit/a.js", "export const a = 'hand';\n");
    h.commit("hand edit");
    assert.equal(h.run("snapshot", "--unit", "unit", "--revert", "--paths", "src/unit/a.js").code, 0);
    h.commit("record revert");
    const waiting = h.run("status").json.units[0];
    assert.equal(waiting.state, "up-to-date");
    assert.deepEqual(waiting.awaiting_render, ["src/unit/a.js"]);

    const rendered = "export const a = 1;\n";
    h.write("plain/plain_modules/unit/code/src/unit/a.js", rendered);
    h.write("src/unit/a.js", rendered);
    h.commit("render replaced the hand edit");
    const after = h.run("status").json.units[0];
    assert.equal(after.unit_changes[0].origin, "rendered");
    assert.equal(h.run("snapshot", "--unit", "unit").code, 0);
    assert.deepEqual(JSON.parse(h.manifest()).units[0].decisions, {});
  });

  test("a capturing unit lists no changes", () => {
    const h = makeHost();
    const u = h.run("status").json.units[0];
    assert.equal(u.state, "capturing");
    assert.deepEqual([u.unit_changes, u.boundary_changes], [[], []]);
  });

  test("a host-file copy under resources/host is flagged once its host file changes", () => {
    const h = makeHost();
    capture(h);
    h.write("plain/resources/host/src/host/base.js", "export class Base {}\n");
    h.commit("copy the base class");
    const fresh = h.run("status");
    assert.equal(fresh.code, 0, fresh.out);
    assert.deepEqual(fresh.json.stale_copies, []);

    h.write("src/host/base.js", "export class Base { y() {} }\n");
    h.commit("host changed its base class");
    const r = h.run("status");
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.stale_copies, [{ path: "src/host/base.js", issue: "differs" }]);
  });

  test("snapshot keeps the recorded answers and intent, in the order they were given", () => {
    const h = makeHost();
    const m = JSON.parse(h.manifest());
    m.answers = [{ topic: "adopt", question: "Proceed despite old modules?", answer: "proceed" }];
    m.units[0].intent = "make the unit regenerable";
    m.units[0].answers = [
      { topic: "state", question: "Keep state in the boundary?", answer: "proceed", commit: h.first },
      { topic: "leak:boot", question: "Keep the constant?", answer: "keep name and value" },
    ];
    h.write("plain/capture.json", JSON.stringify(m));
    h.commit("record answers");
    assert.equal(h.run("snapshot", "--unit", "unit").code, 0);
    const once = h.manifest();
    assert.equal(h.run("snapshot", "--unit", "unit").code, 0);
    assert.equal(h.manifest(), once);
    const after = JSON.parse(once);
    assert.equal(after.answers[0].answer, "proceed");
    assert.equal(after.units[0].intent, "make the unit regenerable");
    assert.deepEqual(after.units[0].answers.map((a) => a.topic), ["state", "leak:boot"]);
  });

  test("rejects an answer without a topic", () => {
    const h = makeHost();
    const m = JSON.parse(h.manifest());
    m.units[0].answers = [{ answer: "proceed" }];
    h.write("plain/capture.json", JSON.stringify(m));
    const r = h.run("status");
    assert.equal(r.code, 2);
    assert.match(r.err, /needs a non-empty "topic" and "answer"/);
  });

  test("rejects a manifest with an unknown version", () => {
    const h = makeHost();
    h.write("plain/capture.json", JSON.stringify({ version: 2, units: [] }));
    const r = h.run("status");
    assert.equal(r.code, 2);
    assert.match(r.err, /unsupported version 2/);
  });
});
