import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, beforeEach, describe, test } from "node:test";

import {
  collectPruneCandidates,
  compareVersions,
  copyTreeTracked,
  deleteForgeFile,
  detectInstalls,
  FORGE_SIGNATURE_SKILLS,
  hasForgeSignature,
  agentsMdPath,
  agentsMdRulesGlob,
  isUpToDate,
  mergeAgentsMd,
  mergeOpencodeInstructions,
  opencodeConfigPath,
  opencodeRulesGlob,
  parseArgs,
  readManifest,
  removeEmptyDirsUpward,
  resolveBaseDir,
  terminalHasLightBackground,
  terminalPalette,
  unmergeAgentsMd,
  unmergeOpencodeInstructions,
  usesAgentsMd,
  toPosix,
  writeManifest,
} from "../bin/cli.mjs";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const CLI = path.join(repoRoot, "bin", "cli.mjs");

// All temp dirs created during the run, cleaned up at the end.
const tmpDirs = [];
function mkTmp(prefix = "pf-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
function write(file, contents = "x") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}
// Plant a manifest-less plain-forge install: all flagship skill dirs present.
function plantLegacySignature(baseDir) {
  for (const skill of FORGE_SIGNATURE_SKILLS) {
    write(path.join(baseDir, "skills", skill, "SKILL.md"), "legacy");
  }
}
// Rewrite an existing manifest's version (and optionally append files) to
// simulate an older install that `update` should refresh.
function ageManifest(baseDir, version, extraFiles = []) {
  const p = path.join(baseDir, ".plain-forge", "manifest.json");
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  m.version = version;
  m.files = [...m.files, ...extraFiles];
  fs.writeFileSync(p, JSON.stringify(m, null, 2));
}

after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe("parseArgs", () => {
  test("parses commands, flags, and values", () => {
    const a = parseArgs(["install", "--agent", "claude", "--scope", "global"]);
    assert.deepEqual(a._, ["install"]);
    assert.equal(a.agent, "claude");
    assert.equal(a.scope, "global");
  });

  test("recognizes -y / --yes and -h / --help", () => {
    assert.equal(parseArgs(["update", "-y"]).yes, true);
    assert.equal(parseArgs(["update", "--yes"]).yes, true);
    assert.equal(parseArgs(["-h"]).help, true);
    assert.equal(parseArgs(["--help"]).help, true);
    assert.equal(parseArgs(["update"]).yes, undefined);
  });

  test("recognizes --skip-plain-parser", () => {
    assert.equal(parseArgs(["install", "--skip-plain-parser"]).skipPlainParser, true);
    assert.equal(parseArgs(["install"]).skipPlainParser, undefined);
  });
});

describe("toPosix", () => {
  test("normalizes OS separators to forward slashes", () => {
    assert.equal(toPosix(path.join("skills", "a", "b.md")), "skills/a/b.md");
  });
});

describe("terminal theme colors", () => {
  test("detects common light and dark COLORFGBG values", () => {
    assert.equal(terminalHasLightBackground({ COLORFGBG: "0;15" }), true);
    assert.equal(terminalHasLightBackground({ COLORFGBG: "15;0" }), false);
    assert.equal(terminalHasLightBackground({ COLORFGBG: "0;7" }), true);
    assert.equal(terminalHasLightBackground({}), false);
  });

  test("uses darker colors on light backgrounds", () => {
    assert.notDeepEqual(
      terminalPalette({ COLORFGBG: "0;15" }),
      terminalPalette({ COLORFGBG: "15;0" }),
    );
  });
});

describe("load-plain-reference content", () => {
  const skillDir = path.join(repoRoot, "forge", "skills", "load-plain-reference");
  const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");

  test("keeps the entrypoint concise and routes to rules instead of duplicating them", () => {
    assert.ok(skill.split("\n").length < 500);
    assert.match(skill, /source of truth/);
    assert.match(skill, /\.\.\/\.\.\/rules\/func-specs\.md/);
    assert.doesNotMatch(skill, /Each functional spec must imply/);
    assert.doesNotMatch(skill, /PLAIN_REFERENCE\.md/);
  });

  test("ships the operational references named by the skill", () => {
    assert.ok(fs.existsSync(path.join(skillDir, "references", "project-model.md")));
    assert.ok(
      fs.existsSync(path.join(skillDir, "references", "rendering-and-testing.md")),
    );
  });
});

describe("compareVersions", () => {
  test("orders dotted numeric versions", () => {
    assert.equal(compareVersions("1.0.10", "1.0.9"), 1);
    assert.equal(compareVersions("1.0.9", "1.0.10"), -1);
    assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
    assert.equal(compareVersions("1.1", "1.1.0"), 0); // missing parts → 0
  });

  test("returns null when a version is not purely numeric", () => {
    assert.equal(compareVersions("unknown", "1.0.0"), null);
    assert.equal(compareVersions("1.0.0", "1.0.0-beta"), null);
  });
});

describe("isUpToDate", () => {
  test("true when current did not increase over installed", () => {
    assert.equal(isUpToDate("1.0.10", "1.0.10"), true); // equal
    assert.equal(isUpToDate("1.0.10", "1.0.9"), true); // current older
  });
  test("false when current is newer or indeterminate", () => {
    assert.equal(isUpToDate("1.0.9", "1.0.10"), false);
    assert.equal(isUpToDate(undefined, "1.0.10"), false);
    assert.equal(isUpToDate("unknown", "1.0.10"), false);
  });
});

describe("copyTreeTracked", () => {
  test("copies files recursively and returns relative paths", () => {
    const src = mkTmp();
    const dest = mkTmp();
    write(path.join(src, "top.md"));
    write(path.join(src, "nested", "deep", "leaf.md"));

    const written = copyTreeTracked(src, dest).map(toPosix).sort();
    assert.deepEqual(written, ["nested/deep/leaf.md", "top.md"]);
    assert.ok(fs.existsSync(path.join(dest, "nested", "deep", "leaf.md")));
  });

  test("dereferences a symlinked directory into real files", () => {
    const src = mkTmp();
    const real = mkTmp();
    write(path.join(real, "inner.md"), "real");
    fs.symlinkSync(real, path.join(src, "linked"));

    const dest = mkTmp();
    const written = copyTreeTracked(src, dest).map(toPosix);
    assert.deepEqual(written, ["linked/inner.md"]);
    const copied = path.join(dest, "linked", "inner.md");
    assert.equal(fs.lstatSync(copied).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(copied, "utf8"), "real");
  });

  test("returns empty list for a missing source", () => {
    assert.deepEqual(copyTreeTracked(path.join(mkTmp(), "nope"), mkTmp()), []);
  });
});

describe("manifest read/write", () => {
  test("round-trips files (sorted, posix) with name and version", () => {
    const base = mkTmp();
    writeManifest(base, ["skills/b.md", "rules/a.md", "skills/a.md"]);
    const m = readManifest(base);
    assert.equal(m.name, "plain-forge");
    assert.match(m.version, /\d+\.\d+\.\d+/);
    assert.deepEqual(m.files, ["rules/a.md", "skills/a.md", "skills/b.md"]);
  });

  test("returns null when absent or malformed", () => {
    const base = mkTmp();
    assert.equal(readManifest(base), null);
    write(path.join(base, ".plain-forge", "manifest.json"), "{ not json");
    assert.equal(readManifest(base), null);
  });
});

describe("collectPruneCandidates", () => {
  test("only returns old files that are gone and still on disk", () => {
    const base = mkTmp();
    write(path.join(base, "skills", "stale.md"));
    write(path.join(base, "skills", "kept.md"));
    // "skills/missing.md" is in the manifest but not on disk → not a candidate.
    const candidates = collectPruneCandidates(
      base,
      ["skills/stale.md", "skills/kept.md", "skills/missing.md"],
      ["skills/kept.md"],
    );
    assert.deepEqual(candidates, ["skills/stale.md"]);
  });
});

describe("deleteForgeFile + removeEmptyDirsUpward", () => {
  test("removes the file and prunes now-empty parent dirs up to base", () => {
    const base = mkTmp();
    const rel = path.join("skills", "gone", "x.md");
    write(path.join(base, rel));

    assert.equal(deleteForgeFile(base, rel), true);
    assert.equal(fs.existsSync(path.join(base, rel)), false);
    assert.equal(fs.existsSync(path.join(base, "skills", "gone")), false);
    // base itself is never removed.
    assert.equal(fs.existsSync(base), true);
  });

  test("stops at a non-empty directory and never touches base", () => {
    const base = mkTmp();
    write(path.join(base, "skills", "a", "x.md"));
    write(path.join(base, "skills", "a", "y.md"));
    deleteForgeFile(base, path.join("skills", "a", "x.md"));
    // sibling kept → dir survives.
    assert.equal(fs.existsSync(path.join(base, "skills", "a", "y.md")), true);

    removeEmptyDirsUpward(path.join(base, "skills", "a"), base);
    assert.equal(fs.existsSync(path.join(base, "skills", "a")), true);
  });
});

describe("hasForgeSignature", () => {
  test("true only when every flagship skill is present", () => {
    const base = mkTmp();
    // A subset is not enough — avoids misdetecting an unrelated agent dir.
    write(path.join(base, "skills", FORGE_SIGNATURE_SKILLS[0], "SKILL.md"));
    assert.equal(hasForgeSignature(base), false);

    plantLegacySignature(base);
    assert.equal(hasForgeSignature(base), true);
  });
});

describe("resolveBaseDir", () => {
  const realCwd = process.cwd();
  after(() => process.chdir(realCwd));

  test("claude/universal use the same dir name in both scopes", () => {
    process.chdir(mkTmp());
    const cwd = process.cwd();
    assert.equal(resolveBaseDir("claude", "project"), path.join(cwd, ".claude"));
    assert.equal(
      resolveBaseDir("claude", "global"),
      path.join(os.homedir(), ".claude"),
    );
    assert.equal(
      resolveBaseDir("universal", "project"),
      path.join(cwd, ".agents"),
    );
  });

  test("codex maps to .agents in both scopes (what Codex actually reads)", () => {
    process.chdir(mkTmp());
    assert.equal(
      resolveBaseDir("codex", "project"),
      path.join(process.cwd(), ".agents"),
    );
    assert.equal(
      resolveBaseDir("codex", "global"),
      path.join(os.homedir(), ".agents"),
    );
    // codex, copilot, and universal share a directory.
    assert.equal(
      resolveBaseDir("codex", "project"),
      resolveBaseDir("universal", "project"),
    );
    assert.equal(
      resolveBaseDir("copilot", "project"),
      resolveBaseDir("universal", "project"),
    );
  });

  test("forgecode is .forge (project) and ~/forge (global, no dot)", () => {
    process.chdir(mkTmp());
    assert.equal(
      resolveBaseDir("forgecode", "project"),
      path.join(process.cwd(), ".forge"),
    );
    assert.equal(
      resolveBaseDir("forgecode", "global"),
      path.join(os.homedir(), "forge"),
    );
  });

  test("opencode project stays at ./.opencode", () => {
    process.chdir(mkTmp());
    assert.equal(
      resolveBaseDir("opencode", "project"),
      path.join(process.cwd(), ".opencode"),
    );
  });

  test("opencode global lands under ~/.config/opencode, not ~/.opencode", () => {
    assert.equal(
      resolveBaseDir("opencode", "global"),
      path.join(os.homedir(), ".config", "opencode"),
    );
  });
});

describe("opencode instructions merge/unmerge", () => {
  const realCwd = process.cwd();
  after(() => process.chdir(realCwd));

  const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

  test("project glob is cwd-relative; global glob is absolute (no ~)", () => {
    process.chdir(mkTmp());
    assert.equal(opencodeRulesGlob("project"), ".opencode/rules/*.md");
    const globalGlob = opencodeRulesGlob("global");
    assert.equal(globalGlob, path.join(os.homedir(), ".config", "opencode", "rules", "*.md").split(path.sep).join("/"));
    assert.ok(!globalGlob.includes("~"), "global glob must not rely on ~ expansion");
    assert.ok(path.isAbsolute(globalGlob), "global glob must be absolute");
  });

  test("creates opencode.json with $schema when none exists", () => {
    process.chdir(mkTmp());
    const res = mergeOpencodeInstructions("project");
    assert.equal(res.status, "created");
    const cfg = readJson(opencodeConfigPath("project"));
    assert.equal(cfg.$schema, "https://opencode.ai/config.json");
    assert.deepEqual(cfg.instructions, [".opencode/rules/*.md"]);
  });

  test("merges into an existing config without disturbing user keys", () => {
    process.chdir(mkTmp());
    const p = opencodeConfigPath("project");
    fs.writeFileSync(
      p,
      JSON.stringify({ theme: "x", instructions: ["docs/a.md"] }),
    );
    const res = mergeOpencodeInstructions("project");
    assert.equal(res.status, "merged");
    const cfg = readJson(p);
    assert.equal(cfg.theme, "x");
    assert.equal(cfg.$schema, undefined, "must not stamp $schema onto a user file");
    assert.deepEqual(cfg.instructions, ["docs/a.md", ".opencode/rules/*.md"]);
  });

  test("merge is idempotent — a second merge reports present, no duplicate", () => {
    process.chdir(mkTmp());
    mergeOpencodeInstructions("project");
    const res = mergeOpencodeInstructions("project");
    assert.equal(res.status, "present");
    const cfg = readJson(opencodeConfigPath("project"));
    assert.deepEqual(cfg.instructions, [".opencode/rules/*.md"]);
  });

  test("never clobbers a malformed config", () => {
    process.chdir(mkTmp());
    const p = opencodeConfigPath("project");
    fs.writeFileSync(p, "{ not json ]");
    const res = mergeOpencodeInstructions("project");
    assert.equal(res.status, "skipped");
    assert.equal(res.reason, "malformed");
    assert.equal(fs.readFileSync(p, "utf8"), "{ not json ]");
  });

  test("unmerge deletes a file that was only our scaffold", () => {
    process.chdir(mkTmp());
    mergeOpencodeInstructions("project");
    const res = unmergeOpencodeInstructions("project");
    assert.equal(res.status, "removed");
    assert.equal(fs.existsSync(opencodeConfigPath("project")), false);
  });

  test("unmerge trims our glob but keeps a user's config", () => {
    process.chdir(mkTmp());
    const p = opencodeConfigPath("project");
    fs.writeFileSync(
      p,
      JSON.stringify({ theme: "x", instructions: ["docs/a.md"] }),
    );
    mergeOpencodeInstructions("project");
    const res = unmergeOpencodeInstructions("project");
    assert.equal(res.status, "updated");
    const cfg = readJson(p);
    assert.equal(cfg.theme, "x");
    assert.deepEqual(cfg.instructions, ["docs/a.md"]);
  });

  test("unmerge on an absent or unrelated config is a no-op", () => {
    process.chdir(mkTmp());
    assert.equal(unmergeOpencodeInstructions("project").status, "absent");
    fs.writeFileSync(
      opencodeConfigPath("project"),
      JSON.stringify({ theme: "x" }),
    );
    assert.equal(unmergeOpencodeInstructions("project").status, "absent");
  });
});

describe("AGENTS.md merge/unmerge (forgecode)", () => {
  const realCwd = process.cwd();
  after(() => process.chdir(realCwd));

  test("only forgecode uses AGENTS.md wiring", () => {
    assert.equal(usesAgentsMd("codex"), false);
    assert.equal(usesAgentsMd("copilot"), false);
    assert.equal(usesAgentsMd("forgecode"), true);
    assert.equal(usesAgentsMd("claude"), false);
    assert.equal(usesAgentsMd("opencode"), false);
    assert.equal(usesAgentsMd("universal"), false);
  });

  test("project AGENTS.md is repo-root; globs are relative and match the layout", () => {
    process.chdir(mkTmp());
    assert.equal(agentsMdRulesGlob("forgecode", "project"), ".forge/rules/*.md");
  });

  test("global AGENTS.md lives in the tool's config dir; glob is absolute", () => {
    assert.equal(
      agentsMdPath("forgecode", "global"),
      path.join(os.homedir(), "forge", "AGENTS.md"),
    );
    const glob = agentsMdRulesGlob("forgecode", "global");
    assert.ok(path.isAbsolute(glob), "global glob must be absolute");
    assert.equal(glob, path.join(os.homedir(), "forge", "rules", "*.md").split(path.sep).join("/"));
  });

  test("creates AGENTS.md with a fenced managed block when none exists", () => {
    process.chdir(mkTmp());
    const res = mergeAgentsMd("forgecode", "project");
    assert.equal(res.status, "created");
    const md = fs.readFileSync(agentsMdPath("forgecode", "project"), "utf8");
    assert.match(md, /BEGIN plain-forge/);
    assert.match(md, /END plain-forge/);
    assert.match(md, /\.forge\/rules\/\*\.md/);
  });

  test("appends the block to an existing AGENTS.md, preserving user content", () => {
    process.chdir(mkTmp());
    const p = agentsMdPath("forgecode", "project");
    fs.writeFileSync(p, "# My project\n\nBuild with `make`.\n");
    const res = mergeAgentsMd("forgecode", "project");
    assert.equal(res.status, "merged");
    const md = fs.readFileSync(p, "utf8");
    assert.match(md, /# My project/);
    assert.match(md, /Build with `make`/);
    assert.match(md, /BEGIN plain-forge/);
  });

  test("merge is idempotent — second merge reports present, single block", () => {
    process.chdir(mkTmp());
    mergeAgentsMd("forgecode", "project");
    const res = mergeAgentsMd("forgecode", "project");
    assert.equal(res.status, "present");
    const md = fs.readFileSync(agentsMdPath("forgecode", "project"), "utf8");
    assert.equal(md.match(/BEGIN plain-forge/g).length, 1, "no duplicate blocks");
  });

  test("unmerge deletes an AGENTS.md that was only our block", () => {
    process.chdir(mkTmp());
    mergeAgentsMd("forgecode", "project");
    const res = unmergeAgentsMd("forgecode", "project");
    assert.equal(res.status, "removed");
    assert.equal(fs.existsSync(agentsMdPath("forgecode", "project")), false);
  });

  test("unmerge strips our block but keeps the user's AGENTS.md content", () => {
    process.chdir(mkTmp());
    const p = agentsMdPath("forgecode", "project");
    fs.writeFileSync(p, "# My project\n\nBuild with `make`.\n");
    mergeAgentsMd("forgecode", "project");
    const res = unmergeAgentsMd("forgecode", "project");
    assert.equal(res.status, "updated");
    const md = fs.readFileSync(p, "utf8");
    assert.match(md, /# My project/);
    assert.doesNotMatch(md, /plain-forge/);
  });
});

describe("detectInstalls", () => {
  const realCwd = process.cwd();
  const realHome = process.env.HOME;

  beforeEach(() => {
    process.chdir(realCwd);
    process.env.HOME = realHome;
  });
  after(() => {
    process.chdir(realCwd);
    process.env.HOME = realHome;
  });

  test("finds manifest-tracked and legacy installs across both scopes", () => {
    const project = mkTmp();
    const home = mkTmp();
    process.chdir(project);
    process.env.HOME = home;

    // project/.claude → manifest-tracked
    writeManifest(path.join(project, ".claude"), ["skills/x.md"]);
    // home/forge → ForgeCode global legacy (all flagship skills, no manifest)
    plantLegacySignature(path.join(home, "forge"));
    // project/.forge → not plain-forge: one flagship skill + an unrelated one,
    // but not the full signature → ignored
    write(path.join(project, ".forge", "skills", "forge-plain", "SKILL.md"));
    write(path.join(project, ".forge", "skills", "someone-else", "SKILL.md"));

    const found = detectInstalls().map((i) => `${i.agent}:${i.scope}`).sort();
    assert.deepEqual(found, ["claude:project", "forgecode:global"]);

    const claude = detectInstalls().find((i) => i.agent === "claude");
    assert.ok(claude.manifest, "manifest install carries its manifest");
    const forge = detectInstalls().find((i) => i.agent === "forgecode");
    assert.equal(forge.manifest, null, "legacy install has no manifest");
  });

  test("a .agents install is detected once, labeled by its manifest agent", () => {
    const project = mkTmp();
    process.chdir(project);
    process.env.HOME = mkTmp();

    // codex, copilot, and universal resolve to .agents; the manifest records which.
    writeManifest(path.join(project, ".agents"), ["skills/x.md"], "codex");

    const found = detectInstalls();
    assert.equal(found.length, 1, "the shared .agents dir must not be double-counted");
    assert.equal(found[0].agent, "codex");
    assert.equal(found[0].scope, "project");
  });

  test("returns nothing when neither scope has an install", () => {
    process.chdir(mkTmp());
    process.env.HOME = mkTmp();
    assert.deepEqual(detectInstalls(), []);
  });
});

// ── Black-box integration tests: spawn the real CLI in an isolated HOME/cwd ──

// `install` would otherwise download uv and plain-parser; python-tools.test.mjs
// covers that step without the network.
function runCli(args, { cwd, home, input } = {}) {
  if (args[0] === "install") args = [...args, "--skip-plain-parser"];
  return spawnSync("node", [CLI, ...args], {
    cwd,
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

describe("cli install (integration)", () => {
  test("fresh install writes content + manifest, refuses re-install, allows other agent", () => {
    const project = mkTmp();
    const home = mkTmp();

    const first = runCli(["install", "--agent", "claude", "--scope", "project"], {
      cwd: project,
      home,
    });
    assert.equal(first.status, 0, first.stderr);
    const manifest = readManifest(path.join(project, ".claude"));
    assert.ok(manifest && manifest.files.length > 0);
    assert.ok(
      fs.existsSync(path.join(project, ".claude", "skills", "forge-plain")),
    );

    // The reported skill count is the number of skill DIRECTORIES, not the
    // total file count (a skill can span several files).
    const skillDirs = fs
      .readdirSync(path.join(repoRoot, "forge", "skills"), {
        withFileTypes: true,
      })
      .filter((e) => e.isDirectory()).length;
    assert.match(first.stdout, new RegExp(`skills:\\s+${skillDirs}\\b`));

    // Re-installing the same agent/scope is refused.
    const again = runCli(["install", "--agent", "claude", "--scope", "project"], {
      cwd: project,
      home,
    });
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already installed/);

    // A different agent into the same folder still works. Codex installs into
    // .agents/ (the dir Codex actually reads) without creating AGENTS.md.
    const codex = runCli(["install", "--agent", "codex", "--scope", "project"], {
      cwd: project,
      home,
    });
    assert.equal(codex.status, 0, codex.stderr);
    assert.ok(fs.existsSync(path.join(project, ".agents", "skills")));
    assert.ok(
      !fs.existsSync(path.join(project, ".codex")),
      "codex must not write to .codex (config-only, skills ignored there)",
    );
    const codexManifest = readManifest(path.join(project, ".agents"));
    assert.equal(codexManifest.agent, "codex", "manifest records the agent");
    assert.equal(fs.existsSync(path.join(project, "AGENTS.md")), false);

    // opencode is a supported agent and installs into .opencode/.
    const opencode = runCli(
      ["install", "--agent", "opencode", "--scope", "project"],
      { cwd: project, home },
    );
    assert.equal(opencode.status, 0, opencode.stderr);
    assert.ok(fs.existsSync(path.join(project, ".opencode", "skills")));
    // opencode also gets its rules wired into opencode.json at the project root.
    const ocCfg = JSON.parse(
      fs.readFileSync(path.join(project, "opencode.json"), "utf8"),
    );
    assert.ok(
      ocCfg.instructions.includes(".opencode/rules/*.md"),
      "install should wire the rules glob into opencode.json",
    );
  });

  test("a failure wiring forgecode rules warns but does not fail the install", () => {
    const project = mkTmp();
    const home = mkTmp();

    // Make AGENTS.md a directory so the ForgeCode rules wiring throws.
    fs.mkdirSync(path.join(project, "AGENTS.md"));

    const res = runCli(["install", "--agent", "forgecode", "--scope", "project"], {
      cwd: project,
      home,
    });

    // Install still succeeds and the skills/rules/manifest are on disk.
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(project, ".forge", "skills")));
    assert.ok(readManifest(path.join(project, ".forge")));
    // ...but the user is warned that the rules wiring didn't complete.
    assert.match(res.stderr, /warning: could not wire up the forgecode rules/);
  });

  test("copilot installs the universal .agents layout without AGENTS.md", () => {
    const project = mkTmp();
    const home = mkTmp();
    const res = runCli(["install", "--agent", "copilot", "--scope", "project"], {
      cwd: project,
      home,
    });

    assert.equal(res.status, 0, res.stderr);
    const base = path.join(project, ".agents");
    assert.ok(fs.existsSync(path.join(base, "skills", "load-plain-reference")));
    assert.ok(
      fs.existsSync(
        path.join(
          base,
          "skills",
          "load-plain-reference",
          "references",
          "project-model.md",
        ),
      ),
    );
    assert.ok(fs.existsSync(path.join(base, "rules", "bullet-continuation.md")));
    assert.equal(readManifest(base).agent, "copilot");
    assert.equal(fs.existsSync(path.join(project, "AGENTS.md")), false);
  });
});

describe("cli update (integration)", () => {
  test("no installs → guidance message, exit 0", () => {
    const res = runCli(["update"], { cwd: mkTmp(), home: mkTmp() });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /no existing plain-forge installations/);
  });

  test("auto-detects an older install and refreshes it", () => {
    const project = mkTmp();
    const home = mkTmp();
    assert.equal(
      runCli(["install", "--agent", "claude", "--scope", "project"], {
        cwd: project,
        home,
      }).status,
      0,
    );
    // Simulate an install from an earlier release so update has work to do.
    ageManifest(path.join(project, ".claude"), "0.0.1");

    const res = runCli(["update"], { cwd: project, home });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /updated claude \(project\)/);
    assert.match(res.stdout, /updated 1 installation\(s\)/);
  });

  test("reports up-to-date when the version did not increase", () => {
    const project = mkTmp();
    const home = mkTmp();
    runCli(["install", "--agent", "claude", "--scope", "project"], {
      cwd: project,
      home,
    });

    // Manifest version equals the current package version → nothing to do.
    const res = runCli(["update"], { cwd: project, home });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /claude \(project\) is already up to date/);
    assert.match(res.stdout, /already using the up-to-date plain-forge/);
    assert.doesNotMatch(res.stdout, /updated 1 installation\(s\)/);
  });

  test("--yes prunes a deprecated file; user files are never touched", () => {
    const project = mkTmp();
    const home = mkTmp();
    runCli(["install", "--agent", "claude", "--scope", "project"], {
      cwd: project,
      home,
    });

    const base = path.join(project, ".claude");
    // Inject a stale file recorded in the manifest, plus a user-owned skill.
    const stale = path.join(base, "skills", "deprecated-skill.md");
    write(stale, "stale");
    const mine = path.join(base, "skills", "my-skill", "SKILL.md");
    write(mine, "mine");
    // Age the manifest (older version) so update runs, and track the stale file.
    ageManifest(base, "0.0.1", ["skills/deprecated-skill.md"]);

    const res = runCli(["update", "--yes"], { cwd: project, home });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.existsSync(stale), false, "deprecated file pruned");
    assert.equal(fs.existsSync(mine), true, "user file untouched");
    const after = readManifest(base);
    assert.ok(!after.files.includes("skills/deprecated-skill.md"));
  });

  test("non-interactive without --yes keeps deprecated files and keeps tracking them", () => {
    const project = mkTmp();
    const home = mkTmp();
    runCli(["install", "--agent", "claude", "--scope", "project"], {
      cwd: project,
      home,
    });

    const base = path.join(project, ".claude");
    const stale = path.join(base, "skills", "deprecated-skill.md");
    write(stale, "stale");
    // Age the manifest so update runs, and track the stale file.
    ageManifest(base, "0.0.1", ["skills/deprecated-skill.md"]);

    // No TTY (spawned, no input) and no --yes → promptConfirm defaults to "no".
    const res = runCli(["update"], { cwd: project, home, input: "" });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.existsSync(stale), true, "deprecated file kept");
    const after = readManifest(base);
    assert.ok(
      after.files.includes("skills/deprecated-skill.md"),
      "kept file stays tracked for the next update",
    );
  });

  test("legacy install (no manifest) is refreshed overwrite-only", () => {
    const project = mkTmp();
    const home = mkTmp();
    const base = path.join(project, ".claude");
    // Simulate a pre-manifest install: all flagship skills present, no manifest.
    plantLegacySignature(base);
    const orphan = path.join(base, "skills", "orphan.md");
    write(orphan, "orphan");

    const res = runCli(["update"], { cwd: project, home });
    assert.equal(res.status, 0, res.stderr);
    // No manifest → version check is skipped, so it is refreshed (never
    // reported "up to date") even though we run the current package version.
    assert.doesNotMatch(res.stdout, /already up to date/);
    assert.match(res.stdout, /updated claude \(project\)/);
    assert.match(res.stdout, /pruned: skipped/);
    assert.equal(fs.existsSync(orphan), true, "nothing pruned without manifest");
    // A manifest is created at the end, stamped with the current version, so
    // the next update can use the version check and prune.
    const created = readManifest(base);
    assert.ok(created, "gains a manifest going forward");
    assert.match(created.version, /\d+\.\d+\.\d+/);
  });
});

describe("cli uninstall (integration)", () => {
  test("removes exactly the manifested files, the manifest, and the empty agent dir", () => {
    const project = mkTmp();
    const home = mkTmp();
    runCli(["install", "--agent", "claude", "--scope", "project"], {
      cwd: project,
      home,
    });
    const base = path.join(project, ".claude");
    assert.ok(fs.existsSync(base));

    const res = runCli(["uninstall", "--agent", "claude", "--scope", "project"], {
      cwd: project,
      home,
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /uninstalled claude \(project\)/);
    // Nothing of plain-forge survives — the whole agent dir is gone since it
    // held only plain-forge content.
    assert.equal(fs.existsSync(base), false, "empty agent dir is pruned");
  });

  test("deletes only manifested files, leaving user-owned content in place", () => {
    const project = mkTmp();
    const home = mkTmp();
    runCli(["install", "--agent", "claude", "--scope", "project"], {
      cwd: project,
      home,
    });
    const base = path.join(project, ".claude");
    const mine = path.join(base, "skills", "my-skill", "SKILL.md");
    write(mine, "mine");

    const res = runCli(["uninstall", "--agent", "claude"], { cwd: project, home });
    assert.equal(res.status, 0, res.stderr);
    // User skill survives; the agent dir survives because it still holds it.
    assert.equal(fs.existsSync(mine), true, "user file untouched");
    assert.equal(readManifest(base), null, "manifest removed");
    assert.equal(
      fs.existsSync(path.join(base, "skills", "forge-plain")),
      false,
      "plain-forge skill removed",
    );
  });

  test("default agent is * — removes every manifested install in the scope", () => {
    const project = mkTmp();
    const home = mkTmp();
    runCli(["install", "--agent", "claude", "--scope", "project"], { cwd: project, home });
    runCli(["install", "--agent", "codex", "--scope", "project"], { cwd: project, home });

    const res = runCli(["uninstall"], { cwd: project, home });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /uninstalled 2 installation\(s\)/);
    assert.equal(fs.existsSync(path.join(project, ".claude")), false);
    assert.equal(fs.existsSync(path.join(project, ".codex")), false);
  });

  test("no manifest → error, files left in place, exit 1", () => {
    const project = mkTmp();
    const home = mkTmp();
    const base = path.join(project, ".claude");
    plantLegacySignature(base); // a plain-forge install with no manifest

    const res = runCli(["uninstall", "--agent", "claude"], { cwd: project, home });
    assert.equal(res.status, 1, "missing manifest is a failure");
    assert.match(res.stderr, /manifest .* is missing/);
    assert.match(res.stderr, /remove plain-forge's files manually/);
    assert.match(res.stderr, new RegExp(path.join(base, "skills").replace(/[.\\]/g, "\\$&")));
    // Nothing deleted.
    assert.equal(
      fs.existsSync(path.join(base, "skills", "forge-plain")),
      true,
      "legacy files are left untouched",
    );
  });

  test("nothing installed → friendly message, exit 0", () => {
    const res = runCli(["uninstall"], { cwd: mkTmp(), home: mkTmp() });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /no plain-forge installation found/);
  });
});
