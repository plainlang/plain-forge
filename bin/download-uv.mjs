// Downloads a uv release archive with Node's fetch, checks it against the
// published SHA-256, and puts `uv` and `uvx` into a bin directory.
//
//   node download-uv.mjs <archive-url> <bin-dir>
//
// Unlike astral's install.sh this needs neither curl/wget nor the system CA
// certificates, which minimal Docker images lack. Only `tar` is required.
//
// Temporary, like python-tools.mjs, which runs it: both go away once
// plain-parser ships as an npm package.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(url, binDir) {
  const [archive, checksum] = await Promise.all([get(url), get(`${url}.sha256`)]);
  const expected = checksum.toString("utf8").trim().split(/\s+/)[0];
  const actual = crypto.createHash("sha256").update(archive).digest("hex");
  if (expected !== actual) throw new Error(`checksum mismatch for ${url}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plain-forge-uv-"));
  try {
    fs.writeFileSync(path.join(tmp, "uv.tar.gz"), archive);
    const tar = spawnSync("tar", ["-xzf", "uv.tar.gz"], { cwd: tmp, stdio: "inherit" });
    if (tar.error || tar.status !== 0) {
      throw new Error(`could not unpack the archive: ${tar.error?.message ?? "tar failed"}`);
    }
    // The archive holds a single folder named after it: uv-<target>/{uv,uvx}.
    const srcDir = path.join(tmp, path.basename(url, ".tar.gz"));
    fs.mkdirSync(binDir, { recursive: true });
    for (const exe of ["uv", "uvx"]) {
      const dest = path.join(binDir, exe);
      fs.copyFileSync(path.join(srcDir, exe), dest);
      fs.chmodSync(dest, 0o755);
    }
    console.log(`installed uv and uvx into ${binDir}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const [url, binDir] = process.argv.slice(2);
try {
  await main(url, binDir);
} catch (err) {
  console.error(`downloading uv failed: ${err.message}`);
  process.exit(1);
}
