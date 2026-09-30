import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";

import { ensurePlainParser, uvCandidates, uvInstallers } from "../bin/python-tools.mjs";

const HOME = path.join(path.sep, "home", "user");
const ENOENT = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });

// A fake host. `onPath` is the set of commands that resolve; `files` the set of
// paths that exist. Handlers can change both, e.g. when an installer runs.
function fakeHost({ onPath = [], files = [], handlers = {} } = {}) {
  const host = { onPath: new Set(onPath), files: new Set(files), calls: [], logs: [] };
  host.run = (cmd, args, opts = {}) => {
    host.calls.push({ cmd, args, inherit: Boolean(opts.inherit) });
    const key = [cmd, ...args].join(" ");
    for (const [prefix, handler] of Object.entries(handlers)) {
      if (key.startsWith(prefix)) return { status: 0, stdout: "", ...handler(host) };
    }
    if (args[0] === "--help") {
      return host.onPath.has(cmd) ? { status: 0, stdout: "" } : { status: null, stdout: "", error: ENOENT };
    }
    return { status: 0, stdout: "" };
  };
  host.opts = (extra = {}) => ({
    platform: "linux",
    arch: "x64",
    env: {},
    home: HOME,
    run: host.run,
    exists: (p) => host.files.has(p),
    log: (m) => host.logs.push(m),
    ...extra,
  });
  return host;
}

const localUv = (exe = "uv") => path.join(HOME, ".local", "bin", exe);
const installs = (host) => host.calls.filter((c) => c.inherit).map((c) => [c.cmd, ...c.args].join(" "));

describe("ensurePlainParser", () => {
  test("does nothing when plain-parser is already on PATH", () => {
    const host = fakeHost({ onPath: ["plain-parser"] });
    assert.deepEqual(ensurePlainParser(host.opts()), { status: "present" });
    assert.deepEqual(installs(host), []);
  });

  test("installs plain-parser with uv from PATH", () => {
    const host = fakeHost({
      onPath: ["uv"],
      handlers: { "uv tool install": (h) => (h.onPath.add("plain-parser"), {}) },
    });
    assert.deepEqual(ensurePlainParser(host.opts()), { status: "installed" });
    assert.deepEqual(installs(host), ["uv tool install plain-parser"]);
  });

  test("uses uv from ~/.local/bin when it is not on PATH", () => {
    const host = fakeHost({
      files: [localUv()],
      handlers: { [`${localUv()} tool install`]: (h) => (h.onPath.add("plain-parser"), {}) },
    });
    assert.deepEqual(ensurePlainParser(host.opts()), { status: "installed" });
    assert.deepEqual(installs(host), [`${localUv()} tool install plain-parser`]);
  });

  test("downloads uv with Node on Linux, then installs plain-parser", () => {
    const host = fakeHost({
      handlers: {
        [process.execPath]: (h) => (h.files.add(localUv()), {}),
        [`${localUv()} tool install`]: (h) => (h.onPath.add("plain-parser"), {}),
      },
    });
    assert.deepEqual(ensurePlainParser(host.opts()), { status: "installed" });
    const [uvInstall, ppInstall] = installs(host);
    assert.match(uvInstall, /download-uv\.mjs /);
    assert.match(uvInstall, /releases\/latest\/download\/uv-x86_64-unknown-linux-musl\.tar\.gz /);
    assert.ok(uvInstall.endsWith(` ${path.join(HOME, ".local", "bin")}`), uvInstall);
    assert.equal(ppInstall, `${localUv()} tool install plain-parser`);
  });

  test("falls back to the shell installer when the Node download fails", () => {
    const host = fakeHost({
      handlers: {
        [process.execPath]: () => ({ status: 1 }),
        "sh -c": (h) => (h.files.add(localUv()), {}),
        [`${localUv()} tool install`]: (h) => (h.onPath.add("plain-parser"), {}),
      },
    });
    assert.deepEqual(ensurePlainParser(host.opts()), { status: "installed" });
    const [download, uvInstall, ppInstall] = installs(host);
    assert.match(download, /download-uv\.mjs/);
    assert.match(uvInstall, /^sh -c .*curl -LsSf https:\/\/astral\.sh\/uv\/install\.sh \| sh/);
    assert.match(uvInstall, /wget -qO- https:\/\/astral\.sh\/uv\/install\.sh \| sh/);
    assert.match(uvInstall, /needs curl or wget/);
    assert.equal(ppInstall, `${localUv()} tool install plain-parser`);
  });

  test("uses only the shell installer on a platform with no known uv target", () => {
    const host = fakeHost({
      handlers: {
        "sh -c": (h) => (h.files.add(localUv()), {}),
        [`${localUv()} tool install`]: (h) => (h.onPath.add("plain-parser"), {}),
      },
    });
    assert.deepEqual(ensurePlainParser(host.opts({ arch: "s390x" })), { status: "installed" });
    assert.match(installs(host)[0], /^sh -c /);
  });

  test("installs uv with the PowerShell installer on Windows", () => {
    const uvExe = localUv("uv.exe");
    const host = fakeHost({
      handlers: {
        "powershell.exe": (h) => (h.files.add(uvExe), {}),
        [`${uvExe} tool install`]: (h) => (h.onPath.add("plain-parser"), {}),
      },
    });
    assert.deepEqual(ensurePlainParser(host.opts({ platform: "win32" })), { status: "installed" });
    const [uvInstall, ppInstall] = installs(host);
    assert.equal(uvInstall.split(" ")[0], "powershell.exe");
    assert.match(uvInstall, /irm https:\/\/astral\.sh\/uv\/install\.ps1 \| iex/);
    assert.equal(ppInstall, `${uvExe} tool install plain-parser`);
  });

  test("warns with the manual commands when installing uv fails", () => {
    const host = fakeHost({
      handlers: { [process.execPath]: () => ({ status: 1 }), "sh -c": () => ({ status: 1 }) },
    });
    assert.deepEqual(ensurePlainParser(host.opts()), { status: "failed" });
    assert.equal(installs(host).length, 2, "tries both uv installers, not uv tool install");
    const out = host.logs.join("\n");
    assert.match(out, /installing uv failed/);
    assert.match(out, /curl -LsSf https:\/\/astral\.sh\/uv\/install\.sh \| sh/);
    assert.match(out, /uv tool install plain-parser/);
  });

  test("warns when uv tool install fails", () => {
    const host = fakeHost({ onPath: ["uv"], handlers: { "uv tool install": () => ({ status: 2 }) } });
    assert.deepEqual(ensurePlainParser(host.opts({ platform: "win32" })), { status: "failed" });
    const out = host.logs.join("\n");
    assert.match(out, /uv tool install plain-parser` failed/);
    assert.match(out, /install\.ps1/);
  });

  test("tells the user to fix PATH when plain-parser lands off PATH", () => {
    const host = fakeHost({
      onPath: ["uv"],
      handlers: { "uv tool dir --bin": () => ({ stdout: "/home/user/.local/bin\n" }) },
    });
    assert.deepEqual(ensurePlainParser(host.opts()), { status: "not-on-path" });
    const out = host.logs.join("\n");
    assert.match(out, /installed into \/home\/user\/\.local\/bin, which is not on your PATH/);
    assert.match(out, /export PATH="\/home\/user\/\.local\/bin:\$PATH"/);
    assert.match(out, /uv tool update-shell/);
  });

  test("does not print an export line on Windows", () => {
    const host = fakeHost({
      onPath: ["uv"],
      handlers: { "uv tool dir --bin": () => ({ stdout: "C:\\Users\\user\\.local\\bin\n" }) },
    });
    assert.deepEqual(ensurePlainParser(host.opts({ platform: "win32" })), { status: "not-on-path" });
    const out = host.logs.join("\n");
    assert.doesNotMatch(out, /export PATH/);
    assert.match(out, /uv tool update-shell/);
  });

  test("does not reinstall a plain-parser that is installed off PATH", () => {
    const binDir = path.join(HOME, ".local", "bin");
    const host = fakeHost({
      onPath: ["uv"],
      files: [path.join(binDir, "plain-parser")],
      handlers: { "uv tool dir --bin": () => ({ stdout: `${binDir}\n` }) },
    });
    assert.deepEqual(ensurePlainParser(host.opts()), { status: "not-on-path" });
    assert.deepEqual(installs(host), []);
    assert.match(host.logs.join("\n"), /uv tool update-shell/);
  });
});

describe("uv helpers", () => {
  test("uvInstallers tries the Node download before install.sh, and PowerShell on Windows", () => {
    const cmds = (platform, arch) => uvInstallers(platform, arch, {}, HOME).map((i) => i.cmd);
    assert.deepEqual(cmds("win32", "x64"), ["powershell.exe"]);
    assert.deepEqual(cmds("linux", "arm64"), [process.execPath, "sh"]);
    assert.deepEqual(cmds("darwin", "arm64"), [process.execPath, "sh"]);
    assert.deepEqual(cmds("linux", "s390x"), ["sh"]);
  });

  test("uvInstallers picks the release archive and install dir for the host", () => {
    const [linux] = uvInstallers("linux", "arm64", {}, HOME);
    assert.match(linux.args[1], /\/uv-aarch64-unknown-linux-musl\.tar\.gz$/);
    assert.equal(linux.args[2], path.join(HOME, ".local", "bin"));
    const [mac] = uvInstallers("darwin", "x64", { UV_INSTALL_DIR: "/opt/uv" }, HOME);
    assert.match(mac.args[1], /\/uv-x86_64-apple-darwin\.tar\.gz$/);
    assert.equal(mac.args[2], "/opt/uv");
  });

  test("uvCandidates honors UV_INSTALL_DIR and XDG_BIN_HOME first", () => {
    const env = { UV_INSTALL_DIR: "/opt/uv", XDG_BIN_HOME: "/xdg/bin" };
    assert.deepEqual(uvCandidates("linux", env, HOME), [
      path.join("/opt/uv", "uv"),
      path.join("/xdg/bin", "uv"),
      path.join(HOME, ".local", "bin", "uv"),
      path.join(HOME, ".cargo", "bin", "uv"),
    ]);
    assert.equal(path.basename(uvCandidates("win32", {}, HOME)[0]), "uv.exe");
  });
});
