#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const pkgRoot = path.resolve(path.dirname(__filename), "..");
const forgeDir = path.join(pkgRoot, "forge");

// Agent name → the project-scope content directory plain-forge writes into.
// These are the directories each tool actually loads skills from (verified
// against the 2026 docs), NOT necessarily a dir named after the tool:
//   - Codex reads skills from .agents/skills (never .codex/skills); .codex is
//     config-only. So codex shares the .agents layout with `copilot` and
//     `universal`.
//   - ForgeCode reads skills from .forge/skills (never .forgecode/skills); its
//     global dir is ~/forge (no dot) — see resolveBaseDir.
//   - OpenCode reads project skills from .opencode; global is ~/.config/opencode
//     — see resolveBaseDir.
// Some scopes/agents diverge from `path.join(root, dir)`; resolveBaseDir owns
// those exceptions.
const AGENTS = {
  claude: ".claude",
  codex: ".agents",
  copilot: ".agents",
  forgecode: ".forge",
  opencode: ".opencode",
  universal: ".agents",
};
const SCOPES = ["project", "global"];

// Subfolders plain-forge writes under an agent directory.
const CONTENT_DIRS = ["skills", "rules", "docs"];
// Manifest recording exactly which files this package installed, so `update`
// can prune our own stale files without touching user or third-party content.
const MANIFEST_REL = path.join(".plain-forge", "manifest.json");
// Flagship skills every plain-forge install ships. Used to recognize legacy
// installs that predate the manifest: if all of these skill directories are
// present, plain-forge is installed even without a manifest.
const FORGE_SIGNATURE_SKILLS = [
  "forge-plain",
  "add-feature",
  "debug-specs",
  "load-plain-reference",
];

// True when baseDir looks like a plain-forge install by its skill footprint
// alone (the manifest-less fallback). Requires every flagship skill so an
// unrelated agent dir with one similarly-named skill is not misdetected.
function hasForgeSignature(baseDir) {
  return FORGE_SIGNATURE_SKILLS.every((skill) =>
    fs.existsSync(path.join(baseDir, "skills", skill)),
  );
}

const BANNER = `██████╗ ██╗      █████╗ ██╗███╗   ██╗      ███████╗ ██████╗ ██████╗  ██████╗ ███████╗
██╔══██╗██║     ██╔══██╗██║████╗  ██║      ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
██████╔╝██║     ███████║██║██╔██╗ ██║█████╗█████╗  ██║   ██║██████╔╝██║  ███╗█████╗
██╔═══╝ ██║     ██╔══██║██║██║╚██╗██║╚════╝██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝
██║     ███████╗██║  ██║██║██║ ╚████║      ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝      ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
`;

const TAGLINE = "turn ideas into ***plain specs.";

function terminalHasLightBackground(env = process.env) {
  const parts = String(env.COLORFGBG ?? "").split(";");
  const background = Number(parts.at(-1));
  if (!Number.isInteger(background)) return false;
  return background === 7 || background >= 9;
}

function terminalPalette(env = process.env) {
  return terminalHasLightBackground(env)
    ? { brand: "76;92;0", plain: "0;105;55", link: "0;85;170" }
    : { brand: "224;255;110", plain: "121;252;150", link: "95;175;255" };
}

const color = (rgb, text, extra = "") =>
  `\x1b[${extra}38;2;${rgb}m${text}\x1b[0m`;

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function bannerWidth() {
  return stripAnsi(BANNER)
    .split("\n")
    .reduce((max, line) => Math.max(max, line.length), 0);
}

function printBanner() {
  if (!process.stdout.isTTY) return;
  const palette = terminalPalette();
  process.stdout.write("\n" + color(palette.brand, BANNER) + "\n");

  const width = bannerWidth();
  const pad = Math.max(0, Math.floor((width - TAGLINE.length) / 2));
  const tag = TAGLINE.replace(
    "***plain",
    color(palette.plain, "***plain"),
  );
  process.stdout.write(" ".repeat(pad) + tag + "\n\n");
}

function usage() {
  console.log(`Usage: plain-forge <command> [options]

Commands:
  install     Install plain-forge into an agent directory
  update      Refresh every existing plain-forge install in cwd and $HOME
  uninstall   Remove a plain-forge install using its manifest

Install options:
  --agent <claude|codex|copilot|forgecode|opencode|universal>
                                               Target agent layout
  --scope <project|global>                     Install into cwd or $HOME
  -h, --help                                   Show this help

Update options:
  -y, --yes                                    Remove deprecated files without
                                               confirming each one

Uninstall options:
  --agent <claude|codex|copilot|forgecode|opencode|universal|*>
                                               Which install to remove
                                               (default: * — every agent)
  --scope <project|global>                     Where to look (default: project)

Examples:
  plain-forge install --agent claude --scope project
  plain-forge install --agent universal --scope global
  plain-forge update
  plain-forge update --yes
  plain-forge uninstall
  plain-forge uninstall --agent claude --scope global

"install" fails if plain-forge is already installed at the target — use
"update" to refresh it. Missing install flags are prompted interactively.
"update" auto-detects installs and prunes only files plain-forge wrote
(confirming each removal), leaving your own and third-party skills untouched.
"uninstall" deletes exactly the files recorded in the install manifest, then
the manifest itself; an install with no manifest is reported and left in place.`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--agent") out.agent = argv[++i];
    else if (a === "--scope") out.scope = argv[++i];
    else if (a === "-y" || a === "--yes") out.yes = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else out._.push(a);
  }
  return out;
}

function promptChoice(question, choices) {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY) {
    return Promise.reject(
      new Error(
        `cannot prompt for "${question}" — stdin is not a TTY. Pass the value as a flag instead.`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    let index = 0;
    let rendered = 0;

    const render = () => {
      if (rendered > 0) {
        readline.moveCursor(output, 0, -rendered);
        readline.clearScreenDown(output);
      }
      output.write(`? ${question} (use arrow keys, enter to select)\n`);
      for (let i = 0; i < choices.length; i++) {
        const pointer = i === index ? "\x1b[36m>\x1b[0m" : " ";
        const label = i === index ? `\x1b[36m${choices[i]}\x1b[0m` : choices[i];
        output.write(`  ${pointer} ${label}\n`);
      }
      rendered = choices.length + 1;
    };

    const cleanup = () => {
      input.removeListener("keypress", onKey);
      input.setRawMode(false);
      input.pause();
      output.write("\x1b[?25h"); // show cursor
    };

    const onKey = (_str, key) => {
      if (!key) return;
      if (key.name === "up" || (key.ctrl && key.name === "p")) {
        index = (index - 1 + choices.length) % choices.length;
        render();
      } else if (key.name === "down" || (key.ctrl && key.name === "n")) {
        index = (index + 1) % choices.length;
        render();
      } else if (key.name === "return") {
        cleanup();
        output.write(`  \x1b[32m${choices[index]}\x1b[0m\n\n`);
        resolve(choices[index]);
      } else if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        cleanup();
        output.write("\n");
        reject(new Error("cancelled"));
      }
    };

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    output.write("\x1b[?25l"); // hide cursor
    input.on("keypress", onKey);
    render();
  });
}

// Ask a yes/no question. Defaults to "no" when stdin is not a TTY, so a
// non-interactive run never deletes anything without an explicit --yes.
function promptConfirm(question) {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY) return Promise.resolve(false);

  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

const toPosix = (p) => p.split(path.sep).join("/");

function readPkgVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"),
    );
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// Compare two dotted numeric versions. Returns 1 if a > b, -1 if a < b, 0 if
// equal, or null when either version is not purely numeric (e.g. "unknown").
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

// An install is up to date when the package version did not increase over the
// version recorded in its manifest. Indeterminate versions ("unknown", or a
// missing manifest version) are never treated as up to date, so the refresh
// proceeds rather than silently skipping.
function isUpToDate(installedVersion, currentVersion) {
  const cmp = compareVersions(currentVersion, installedVersion);
  return cmp !== null && cmp <= 0;
}

// Copy srcDir into destDir file-by-file (dereferencing symlinks), returning the
// list of file paths written, each relative to destDir.
function copyTreeTracked(srcDir, destDir) {
  const written = [];
  if (!fs.existsSync(srcDir)) return written;

  const walk = (rel) => {
    const srcPath = path.join(srcDir, rel);
    const destPath = path.join(destDir, rel);
    const stat = fs.statSync(srcPath); // follows symlinks → dereferences
    if (stat.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      for (const entry of fs.readdirSync(srcPath)) {
        walk(path.join(rel, entry));
      }
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      written.push(rel);
    }
  };

  for (const entry of fs.readdirSync(srcDir)) {
    walk(entry);
  }
  return written;
}

// Copy every content dir into baseDir. Returns the flat list of files written
// (each relative to baseDir, for the manifest) and the per-dir counts. A count
// is the number of top-level items in that dir — i.e. the number of skills
// (each a directory) or rules, not the total file count, since a single skill
// can span several files.
function writeContent(baseDir) {
  const counts = {};
  const files = [];
  for (const dir of CONTENT_DIRS) {
    const written = copyTreeTracked(
      path.join(forgeDir, dir),
      path.join(baseDir, dir),
    );
    const topLevel = new Set(written.map((rel) => rel.split(path.sep)[0]));
    counts[dir] = topLevel.size;
    for (const rel of written) files.push(path.join(dir, rel));
  }
  return { counts, files };
}

// Absolute install directory for an agent in a given scope. Global scope roots
// at $HOME, project scope at the cwd. OpenCode is the one exception: its global
// config lives under XDG at ~/.config/opencode — it does NOT read ~/.opencode —
// while its project layout is ./.opencode like every other agent.
function resolveBaseDir(agent, scope) {
  const root = scope === "global" ? os.homedir() : process.cwd();
  if (agent === "opencode" && scope === "global") {
    return path.join(root, ".config", "opencode");
  }
  if (agent === "forgecode" && scope === "global") {
    // ForgeCode's global content dir is ~/forge, not ~/.forge.
    return path.join(root, "forge");
  }
  return path.join(root, AGENTS[agent]);
}

// --- OpenCode instructions wiring -------------------------------------------
// OpenCode does not auto-read a rules/ directory the way it does skills/; it
// loads extra instruction files from the `instructions` glob array in
// opencode.json. So for opencode we merge a glob pointing at our rules dir into
// that file (creating it if needed, never disturbing the user's own keys) so
// the ***plain rules actually apply. This is opencode-specific — every other
// agent just gets the verbatim file copy.

const OPENCODE_SCHEMA = "https://opencode.ai/config.json";

// Location of opencode.json for a scope. Project config lives at the project
// root (cwd), global config under ~/.config/opencode.
function opencodeConfigPath(scope) {
  if (scope === "global") {
    return path.join(os.homedir(), ".config", "opencode", "opencode.json");
  }
  return path.join(process.cwd(), "opencode.json");
}

// The instructions glob to add. Project scope uses a cwd-relative glob (opencode
// resolves relative instruction paths against the launch cwd). Global scope must
// be absolute: opencode does not expand ~ and would resolve a relative path
// against the project cwd, not the config dir. Only top-level rules/*.md are
// wired in — the examples/ subtree holds reference scripts, not instructions.
function opencodeRulesGlob(scope) {
  if (scope === "global") {
    return toPosix(
      path.join(os.homedir(), ".config", "opencode", "rules", "*.md"),
    );
  }
  return ".opencode/rules/*.md";
}

// Add our rules glob to opencode.json's `instructions`, creating or merging the
// file. Returns a status: "created" | "merged" | "present" | "skipped".
function mergeOpencodeInstructions(scope) {
  const configPath = opencodeConfigPath(scope);
  const glob = opencodeRulesGlob(scope);
  const existed = fs.existsSync(configPath);

  let config = {};
  if (existed) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      return { status: "skipped", reason: "malformed", configPath, glob };
    }
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      return { status: "skipped", reason: "not-an-object", configPath, glob };
    }
  }

  const list = Array.isArray(config.instructions) ? config.instructions : [];
  if (list.includes(glob)) return { status: "present", configPath, glob };

  // Only stamp $schema onto a file we are creating; never touch an existing one.
  if (!existed && config.$schema === undefined) config.$schema = OPENCODE_SCHEMA;
  config.instructions = list.concat(glob);

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  return { status: existed ? "merged" : "created", configPath, glob };
}

// Reverse of the merge: drop our glob from opencode.json's `instructions`. If
// that leaves a file containing only our scaffold ($schema + now-empty
// instructions), delete it; otherwise write back the trimmed config, leaving
// every user-authored key intact. Returns "removed" | "updated" | "absent" |
// "skipped".
function unmergeOpencodeInstructions(scope) {
  const configPath = opencodeConfigPath(scope);
  const glob = opencodeRulesGlob(scope);
  if (!fs.existsSync(configPath)) return { status: "absent", configPath, glob };

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return { status: "skipped", reason: "malformed", configPath, glob };
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return { status: "skipped", reason: "not-an-object", configPath, glob };
  }
  if (!Array.isArray(config.instructions) || !config.instructions.includes(glob)) {
    return { status: "absent", configPath, glob };
  }

  config.instructions = config.instructions.filter((g) => g !== glob);

  const onlyScaffold =
    config.instructions.length === 0 &&
    Object.keys(config).every((k) => k === "$schema" || k === "instructions");
  if (onlyScaffold) {
    fs.rmSync(configPath, { force: true });
    return { status: "removed", configPath, glob };
  }

  if (config.instructions.length === 0) delete config.instructions;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  return { status: "updated", configPath, glob };
}

// Human-readable line for a merge result, printed under the install/update
// summary. A skip is a warning the user should see (their config is untouched).
function reportOpencodeMerge(result) {
  switch (result.status) {
    case "created":
      console.log(`  opencode.json: created, wired rules via "${result.glob}"`);
      break;
    case "merged":
      console.log(`  opencode.json: added rules glob "${result.glob}"`);
      break;
    case "present":
      console.log(`  opencode.json: rules glob already present`);
      break;
    case "skipped":
      console.log(
        `  opencode.json: left untouched (${result.reason}) — add "${result.glob}" to its "instructions" manually`,
      );
      break;
  }
}

// Human-readable line for an unmerge result during uninstall.
function reportOpencodeUnmerge(result) {
  switch (result.status) {
    case "removed":
      console.log(`  opencode.json: removed (was only plain-forge's rules wiring)`);
      break;
    case "updated":
      console.log(`  opencode.json: removed rules glob, kept your other config`);
      break;
    case "skipped":
      console.log(
        `  opencode.json: left untouched (${result.reason}) — remove "${result.glob}" from "instructions" manually`,
      );
      break;
  }
}

// --- ForgeCode instructions wiring ------------------------------------------
// ForgeCode does not auto-read a rules/ directory; it loads custom instructions
// from AGENTS.md (repo AGENTS.md or ~/forge/AGENTS.md). AGENTS.md has no
// include/glob mechanism,
// so we append a managed pointer block that tells the agent to read our rules
// dir when touching .plain files. The block is fenced by markers so it can be
// refreshed or removed idempotently without disturbing the user's own content.

const AGENTS_MD_BEGIN = "<!-- BEGIN plain-forge (managed) -->";
const AGENTS_MD_END = "<!-- END plain-forge (managed) -->";

// Agents whose rules are delivered through AGENTS.md rather than a natively
// auto-loaded rules/ dir (claude) or a config glob (opencode).
function usesAgentsMd(agent) {
  return agent === "forgecode";
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Where the tool reads AGENTS.md from for a scope. Project scope is the repo
// root (cwd) for both tools; global scope differs per tool.
function agentsMdPath(agent, scope) {
  if (scope === "project") return path.join(process.cwd(), "AGENTS.md");
  // Retained only so update/uninstall can remove blocks created by older Codex
  // installs. New Codex installs do not create this file.
  if (agent === "codex") return path.join(os.homedir(), ".codex", "AGENTS.md");
  return path.join(os.homedir(), "forge", "AGENTS.md");
}

// Glob the pointer block references — the installed rules dir. Project scope is
// written relative to the repo root; global scope must be absolute (these files
// are consulted from arbitrary working directories).
function agentsMdRulesGlob(agent, scope) {
  const rulesDir = path.join(resolveBaseDir(agent, scope), "rules");
  if (scope === "global") return toPosix(path.join(rulesDir, "*.md"));
  return toPosix(path.join(path.relative(process.cwd(), rulesDir), "*.md"));
}

function agentsMdBlock(glob) {
  return [
    AGENTS_MD_BEGIN,
    "## ***plain authoring rules (plain-forge)",
    "",
    "When creating or editing `.plain` specification files, first read and follow",
    `every rule file matching \`${glob}\`. Each file covers one section or topic of`,
    "the ***plain language; they are installed and maintained by plain-forge.",
    AGENTS_MD_END,
  ].join("\n");
}

// Add or refresh the managed pointer block in AGENTS.md, creating the file if
// needed and preserving all user content. Returns a status:
// "created" | "merged" | "refreshed" | "present".
function mergeAgentsMd(agent, scope) {
  const filePath = agentsMdPath(agent, scope);
  const glob = agentsMdRulesGlob(agent, scope);
  const block = agentsMdBlock(glob);
  const existed = fs.existsSync(filePath);
  let content = existed ? fs.readFileSync(filePath, "utf8") : "";

  const hadBlock = content.includes(AGENTS_MD_BEGIN);
  if (hadBlock) {
    const re = new RegExp(
      `${escapeRe(AGENTS_MD_BEGIN)}[\\s\\S]*?${escapeRe(AGENTS_MD_END)}`,
    );
    const replaced = content.replace(re, block);
    if (replaced === content) return { status: "present", filePath, glob };
    content = replaced;
  } else {
    if (content && !content.endsWith("\n")) content += "\n";
    if (content) content += "\n";
    content += block + "\n";
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  const status = !existed ? "created" : hadBlock ? "refreshed" : "merged";
  return { status, filePath, glob };
}

// Remove the managed pointer block. Deletes the file if nothing but the block
// (and whitespace) remains; otherwise writes back the user's content.
// Returns "removed" | "updated" | "absent".
function unmergeAgentsMd(agent, scope) {
  const filePath = agentsMdPath(agent, scope);
  if (!fs.existsSync(filePath)) return { status: "absent", filePath };
  let content = fs.readFileSync(filePath, "utf8");
  if (!content.includes(AGENTS_MD_BEGIN)) return { status: "absent", filePath };

  const re = new RegExp(
    `\\n*${escapeRe(AGENTS_MD_BEGIN)}[\\s\\S]*?${escapeRe(AGENTS_MD_END)}\\n*`,
  );
  content = content.replace(re, "\n");

  if (content.trim() === "") {
    fs.rmSync(filePath, { force: true });
    return { status: "removed", filePath };
  }
  content = content.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
  if (!content.endsWith("\n")) content += "\n";
  fs.writeFileSync(filePath, content);
  return { status: "updated", filePath };
}

function reportAgentsMdMerge(result) {
  const rel = result.filePath;
  switch (result.status) {
    case "created":
      console.log(`  AGENTS.md: created at ${rel}, wired rules via "${result.glob}"`);
      break;
    case "merged":
      console.log(`  AGENTS.md: added rules block to ${rel}`);
      break;
    case "refreshed":
      console.log(`  AGENTS.md: refreshed rules block in ${rel}`);
      break;
    case "present":
      console.log(`  AGENTS.md: rules block already up to date`);
      break;
  }
}

function reportAgentsMdUnmerge(result) {
  switch (result.status) {
    case "removed":
      console.log(`  AGENTS.md: removed (was only plain-forge's rules block)`);
      break;
    case "updated":
      console.log(`  AGENTS.md: removed rules block, kept your other content`);
      break;
  }
}

// Wire rules for an agent whose mechanism needs it, during install/update.
// The skills/rules/docs and manifest are already on disk by the time this runs,
// so a failure here (e.g. an unwritable opencode.json/AGENTS.md) must not fail
// the whole install — it degrades to a warning and the install still succeeds.
function wireRules(agent, scope) {
  try {
    if (agent === "opencode") {
      reportOpencodeMerge(mergeOpencodeInstructions(scope));
    } else if (usesAgentsMd(agent)) {
      reportAgentsMdMerge(mergeAgentsMd(agent, scope));
    } else if (agent === "codex") {
      // Migrate installs from the former Codex AGENTS.md wiring. Rules are now
      // loaded by load-plain-reference itself.
      reportAgentsMdUnmerge(unmergeAgentsMd(agent, scope));
    }
  } catch (err) {
    warnRulesWiring("wire", agent, err);
  }
}

// Reverse of wireRules, during uninstall. Also non-fatal: the manifest files
// are already gone, so a failure to tidy up the rules wiring is a warning, not
// an uninstall failure.
function unwireRules(agent, scope) {
  try {
    if (agent === "opencode") {
      reportOpencodeUnmerge(unmergeOpencodeInstructions(scope));
    } else if (usesAgentsMd(agent) || agent === "codex") {
      reportAgentsMdUnmerge(unmergeAgentsMd(agent, scope));
    }
  } catch (err) {
    warnRulesWiring("unwire", agent, err);
  }
}

function warnRulesWiring(action, agent, err) {
  const target = agent === "opencode" ? "opencode.json" : "AGENTS.md";
  const verb = action === "wire" ? "wire up" : "clean up";
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(
    `  warning: could not ${verb} the ${agent} rules in ${target} (${msg}).`,
  );
  console.warn(
    `  the skills and rule files were installed successfully; see the README`,
  );
  console.warn(`  section "How the rules get applied per agent" to finish by hand.`);
}

function manifestPathFor(baseDir) {
  return path.join(baseDir, MANIFEST_REL);
}

function readManifest(baseDir) {
  try {
    const data = JSON.parse(fs.readFileSync(manifestPathFor(baseDir), "utf8"));
    if (data && Array.isArray(data.files)) return data;
  } catch {
    /* missing or malformed manifest → treat as absent */
  }
  return null;
}

function writeManifest(baseDir, files, agent) {
  const target = manifestPathFor(baseDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // `agent` records which agent layout produced this install. It matters when
  // Multiple agents resolve to the same .agents dir, so the manifest preserves
  // the selected label for detection, updates, and uninstall output.
  const manifest = {
    name: "plain-forge",
    version: readPkgVersion(),
    ...(agent ? { agent } : {}),
    files: files.map(toPosix).sort(),
  };
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n");
}

// Remove now-empty directories from `dir` upward, stopping at (and never
// removing) stopAt.
function removeEmptyDirsUpward(dir, stopAt) {
  let cur = dir;
  while (cur !== stopAt && cur.startsWith(stopAt + path.sep)) {
    try {
      if (fs.readdirSync(cur).length > 0) break;
      fs.rmdirSync(cur);
      cur = path.dirname(cur);
    } catch {
      break;
    }
  }
}

// Files present in the prior manifest but absent from the fresh copy, that
// still exist on disk. Only paths plain-forge itself recorded are ever
// considered — user/third-party files are never in the manifest.
function collectPruneCandidates(baseDir, oldFiles, newFiles) {
  const keep = new Set(newFiles.map(toPosix));
  const candidates = [];
  for (const rel of oldFiles) {
    if (keep.has(toPosix(rel))) continue;
    if (fs.existsSync(path.join(baseDir, rel))) candidates.push(toPosix(rel));
  }
  return candidates;
}

function deleteForgeFile(baseDir, rel) {
  const target = path.join(baseDir, rel);
  try {
    fs.rmSync(target, { force: true });
    removeEmptyDirsUpward(path.dirname(target), baseDir);
    return true;
  } catch {
    return false;
  }
}

// Find every plain-forge install in cwd and $HOME. An install is recognized by
// its manifest, or — for installs predating the manifest — by the presence of
// the flagship skill.
function detectInstalls() {
  const installs = [];
  const seen = new Set();
  for (const scope of SCOPES) {
    for (const agent of Object.keys(AGENTS)) {
      const baseDir = resolveBaseDir(agent, scope);
      // Some agents share the .agents directory.
      // Only inspect each physical dir once so a single install isn't detected
      // — and later updated/pruned — twice.
      if (seen.has(baseDir)) continue;
      seen.add(baseDir);
      if (!fs.existsSync(baseDir)) continue;
      const manifest = readManifest(baseDir);
      const isLegacy = !manifest && hasForgeSignature(baseDir);
      if (manifest || isLegacy) {
        // Prefer the agent recorded at install time; fall back to the dir's
        // first-mapped agent for legacy/manifest-less installs.
        installs.push({ agent: manifest?.agent ?? agent, scope, baseDir, manifest });
      }
    }
  }
  return installs;
}

async function cmdInstall(args) {
  printBanner();

  let agent = args.agent;
  if (!agent) agent = await promptChoice("Which agent ?", Object.keys(AGENTS));
  if (!Object.hasOwn(AGENTS, agent)) {
    console.error(
      `unknown agent "${agent}". valid: ${Object.keys(AGENTS).join(", ")}`,
    );
    process.exit(2);
  }

  let scope = args.scope;
  if (!scope) scope = await promptChoice("Scope ?", SCOPES);
  if (!SCOPES.includes(scope)) {
    console.error(`unknown scope "${scope}". valid: ${SCOPES.join(", ")}`);
    process.exit(2);
  }

  const baseDir = resolveBaseDir(agent, scope);

  const alreadyInstalled =
    readManifest(baseDir) !== null || hasForgeSignature(baseDir);
  if (alreadyInstalled) {
    console.error(`plain-forge is already installed in ${baseDir}.`);
    console.error(`run "plain-forge update" to refresh it.`);
    process.exit(1);
  }

  const { counts, files } = writeContent(baseDir);
  writeManifest(baseDir, files, agent);

  console.log(`installed into ${baseDir}`);
  console.log(`  skills: ${counts.skills}`);
  console.log(`  rules:  ${counts.rules}`);
  console.log(`  docs:   ${counts.docs}`);
  wireRules(agent, scope);
  console.log();
  printNextSteps(agent);
}

async function cmdUpdate(args) {
  printBanner();

  const installs = detectInstalls();
  if (installs.length === 0) {
    console.log(
      "no existing plain-forge installations found in this folder or your home directory.",
    );
    console.log(`run "plain-forge install" to set one up.`);
    return;
  }

  const version = readPkgVersion();
  let updated = 0;
  for (const inst of installs) {
    const hasManifest = inst.manifest != null;

    // The up-to-date check applies only to manifest-tracked installs. With no
    // manifest there is no recorded version to compare against, so the version
    // check is skipped and the install is always refreshed — a manifest is then
    // written for it at the end of this iteration (see writeManifest below).
    if (hasManifest && isUpToDate(inst.manifest.version, version)) {
      console.log(
        `${inst.agent} (${inst.scope}) is already up to date (v${inst.manifest.version}).`,
      );
      console.log();
      continue;
    }

    const oldFiles = inst.manifest?.files ?? [];
    const { counts, files } = writeContent(inst.baseDir);

    console.log(`updated ${inst.agent} (${inst.scope}) → ${inst.baseDir}`);
    console.log(
      `  skills: ${counts.skills}  rules: ${counts.rules}  docs: ${counts.docs}`,
    );
    // Re-assert rules wiring (opencode.json / AGENTS.md) — installs from before
    // this feature lack it; the merge is idempotent for those that already have
    // it, and refreshes the glob if the layout changed.
    wireRules(inst.agent, inst.scope);

    // Pruning only applies to manifest-tracked installs. Each deprecated file
    // is confirmed individually before removal; denied files stay on disk and
    // remain tracked so the next update re-offers them.
    const kept = [];
    if (!hasManifest) {
      console.log(`  pruned: skipped (no manifest from prior install)`);
    } else {
      const candidates = collectPruneCandidates(inst.baseDir, oldFiles, files);
      let pruned = 0;
      for (const rel of candidates) {
        console.log(
          `  The file corresponds to a plain-forge file that has been deprecated or removed:`,
        );
        console.log(`    ${rel}`);
        const remove = args.yes
          ? true
          : await promptConfirm("  Please confirm its removal.");
        if (remove && deleteForgeFile(inst.baseDir, rel)) {
          pruned++;
        } else {
          kept.push(rel);
        }
      }
      console.log(
        `  pruned: ${pruned}${kept.length ? `  kept: ${kept.length}` : ""}`,
      );
    }

    // Manifest reflects what's actually on disk: the fresh files plus any
    // deprecated files the user chose to keep.
    writeManifest(inst.baseDir, files.concat(kept), inst.agent);
    console.log();
    updated++;
  }

  if (updated === 0) {
    console.log(
      `you are already using the up-to-date plain-forge (v${version}).`,
    );
  } else {
    console.log(`updated ${updated} installation(s) to v${version}.`);
  }
}

async function cmdUninstall(args) {
  printBanner();

  const scope = args.scope ?? "project";
  if (!SCOPES.includes(scope)) {
    console.error(`unknown scope "${scope}". valid: ${SCOPES.join(", ")}`);
    process.exit(2);
  }

  // Default agent is "*" — every agent layout. A named agent narrows to one.
  const agentArg = args.agent ?? "*";
  let agents;
  if (agentArg === "*" || agentArg === "all") {
    agents = Object.keys(AGENTS);
  } else if (Object.hasOwn(AGENTS, agentArg)) {
    agents = [agentArg];
  } else {
    console.error(
      `unknown agent "${agentArg}". valid: ${Object.keys(AGENTS).join(", ")}, or "*" for all`,
    );
    process.exit(2);
  }

  const root = scope === "global" ? os.homedir() : process.cwd();

  let found = 0;
  let removed = 0;
  let hadError = false;

  for (const agent of agents) {
    const baseDir = resolveBaseDir(agent, scope);
    if (!fs.existsSync(baseDir)) continue;

    const manifest = readManifest(baseDir);
    const legacy = !manifest && hasForgeSignature(baseDir);
    if (!manifest && !legacy) continue; // not a plain-forge install
    found++;

    // No manifest → we have no record of which files are ours, so deleting
    // would risk touching the user's own content. Refuse and point at the
    // directories to clean by hand.
    if (!manifest) {
      hadError = true;
      console.error(`cannot uninstall ${agent} (${scope}) — ${baseDir}`);
      console.error(
        `  the install manifest (${MANIFEST_REL}) is missing, so automatic deletion is not supported.`,
      );
      console.error(`  please remove plain-forge's files manually from:`);
      for (const dir of CONTENT_DIRS) {
        const p = path.join(baseDir, dir);
        if (fs.existsSync(p)) console.error(`    ${p}`);
      }
      console.error("");
      continue;
    }

    let deleted = 0;
    let failed = 0;
    for (const rel of manifest.files) {
      if (deleteForgeFile(baseDir, rel)) deleted++;
      else failed++;
    }
    // Remove the manifest itself.
    fs.rmSync(manifestPathFor(baseDir), { force: true });

    console.log(`uninstalled ${agent} (${scope}) from ${baseDir}`);
    console.log(
      `  removed ${deleted} file(s)${failed ? `, ${failed} could not be removed` : ""} + manifest`,
    );

    // Undo the rules wiring (opencode.json / AGENTS.md). Keyed off the agent
    // recorded at install time, not the requested name. Done
    // before the dir cleanup so a now-orphaned config file living inside baseDir
    // (e.g. forgecode-global ~/forge/AGENTS.md) can be removed and let baseDir
    // itself be pruned.
    unwireRules(manifest.agent ?? agent, scope);

    // Prune the now-empty .plain-forge directory and the agent directory if
    // nothing else remains in it.
    removeEmptyDirsUpward(
      path.join(baseDir, path.dirname(MANIFEST_REL)),
      baseDir,
    );
    // Stop at the agent dir's parent so only the agent dir itself is pruned
    // (e.g. for opencode-global we remove ~/.config/opencode, never ~/.config).
    removeEmptyDirsUpward(baseDir, path.dirname(baseDir));
    console.log();
    removed++;
  }

  if (found === 0) {
    console.log(`no plain-forge installation found in ${root} (scope: ${scope}).`);
    return;
  }
  if (removed > 0) {
    console.log(`uninstalled ${removed} installation(s).`);
  }
  if (hadError) process.exit(1);
}

function printNextSteps(agent) {
  const palette = terminalPalette();
  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const dim = (s) => `\x1b[2m${s}\x1b[0m`;
  const plain = (s) => color(palette.plain, s);
  const link = (s) => color(palette.link, s, "4;");

  console.log(`\x1b[1mnext steps:\x1b[0m`);
  console.log(
    `  1. open a project folder and start your ${agentLabel(agent)} session.`,
  );
  console.log(`  2. invoke one of:`);
  console.log(
    `       ${bold("forge-plain")}        — start a brand-new ${plain("***plain")} project from scratch`,
  );
  console.log(
    `       ${bold("init-plain-project")} — scaffold a minimal ${plain("***plain")} project to grow feature-by-feature`,
  );
  console.log(
    `       ${bold("add-feature")}        — add a feature to an existing ${plain("***plain")} project`,
  );
  console.log();
  console.log(
    `usage guide: ${link("https://github.com/plainlang/plain-forge#usage")}`,
  );
  console.log();
}

function agentLabel(agent) {
  switch (agent) {
    case "claude":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "copilot":
      return "GitHub Copilot";
    case "forgecode":
      return "ForgeCode";
    case "opencode":
      return "OpenCode";
    case "universal":
      return "AI coding agent";
    default:
      return "agent";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) {
    usage();
    return;
  }
  const cmd = args._[0];
  switch (cmd) {
    case "install":
      await cmdInstall(args);
      break;
    case "update":
      await cmdUpdate(args);
      break;
    case "uninstall":
      await cmdUninstall(args);
      break;
    default:
      console.error(`unknown command "${cmd}"`);
      usage();
      process.exit(2);
  }
}

// Only run the CLI when executed directly — importing this module (e.g. from
// the test suite) must not trigger main() or process.exit().
// `__filename` (from import.meta.url) is realpath-resolved by Node, but
// process.argv[1] is the path as invoked — under npx / a global install it's a
// symlink in node_modules/.bin or the npx cache. Resolve both through realpath
// so the comparison survives symlinked bins; otherwise main() silently never
// runs (spinner, then nothing).
function isInvokedDirectly() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return fs.realpathSync(invoked) === __filename;
  } catch {
    return path.resolve(invoked) === __filename;
  }
}
const invokedDirectly = isInvokedDirectly();
if (invokedDirectly) {
  main().catch((err) => {
    if (err instanceof Error && err.message === "cancelled") {
      process.exit(130);
    }
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  });
}

export {
  AGENTS,
  SCOPES,
  CONTENT_DIRS,
  MANIFEST_REL,
  FORGE_SIGNATURE_SKILLS,
  hasForgeSignature,
  parseArgs,
  toPosix,
  readPkgVersion,
  compareVersions,
  isUpToDate,
  copyTreeTracked,
  writeContent,
  resolveBaseDir,
  opencodeConfigPath,
  opencodeRulesGlob,
  mergeOpencodeInstructions,
  unmergeOpencodeInstructions,
  usesAgentsMd,
  agentsMdPath,
  agentsMdRulesGlob,
  mergeAgentsMd,
  unmergeAgentsMd,
  manifestPathFor,
  readManifest,
  writeManifest,
  removeEmptyDirsUpward,
  collectPruneCandidates,
  deleteForgeFile,
  detectInstalls,
  promptConfirm,
  terminalHasLightBackground,
  terminalPalette,
};
