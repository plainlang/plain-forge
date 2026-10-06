// Black-box tests for packages/regenerative-software/cli.cjs, the
// `npx @plainlang/regenerative-software` wrapper. Each test copies the wrapper next to
// a stand-in plain-forge CLI, so they check forwarding rather than plain-forge itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WRAPPER = fileURLToPath(new URL('../packages/regenerative-software/cli.cjs', import.meta.url));

const STAND_IN = `import fs from 'node:fs';
if (process.argv[2] === 'wait') {
  process.on('SIGTERM', () => { fs.writeFileSync(process.argv[3] + '.stopped', 'yes'); process.exit(0); });
  fs.writeFileSync(process.argv[3], String(process.pid));
  setInterval(() => {}, 1000);
} else {
  console.log(JSON.stringify({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    marker: process.env.WRAPPER_MARKER,
    input: fs.readFileSync(0, 'utf8'),
  }));
  console.error('stderr preserved');
  process.exit(Number(process.env.WRAPPER_EXIT || 0));
}
`;

function makeWrapper() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'regen-sw-')));
  const pkg = path.join(root, 'wrapper');
  const forgeBin = path.join(pkg, 'node_modules', 'plain-forge', 'bin');
  fs.mkdirSync(forgeBin, { recursive: true });
  fs.writeFileSync(path.join(forgeBin, '..', 'package.json'), '{"name":"plain-forge","type":"module"}');
  fs.writeFileSync(path.join(forgeBin, 'cli.mjs'), STAND_IN);
  fs.copyFileSync(WRAPPER, path.join(pkg, 'cli.cjs'));
  const project = path.join(root, 'project with spaces');
  fs.mkdirSync(project);
  return { root, cli: path.join(pkg, 'cli.cjs'), project };
}

for (const expected of [0, 7]) {
  test(`forwards args, cwd, env and stdio; exits ${expected}`, () => {
    const { root, cli, project } = makeWrapper();
    try {
      const args = ['install', '--label', 'space and $literal; "text"'];
      const r = spawnSync(process.execPath, [cli, ...args], {
        cwd: project,
        env: { ...process.env, WRAPPER_MARKER: 'present', WRAPPER_EXIT: String(expected) },
        input: 'stdin preserved',
        encoding: 'utf8',
      });
      assert.equal(r.status, expected, r.stderr);
      assert.deepEqual(JSON.parse(r.stdout), { args, cwd: project, marker: 'present', input: 'stdin preserved' });
      assert.equal(r.stderr, 'stderr preserved\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('reports a missing plain-forge dependency and exits 1', () => {
  const { root, cli } = makeWrapper();
  try {
    fs.rmSync(path.join(path.dirname(cli), 'node_modules'), { recursive: true });
    const r = spawnSync(process.execPath, [cli, 'install'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Unable to locate the plain-forge CLI/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('SIGTERM sent only to the wrapper reaches plain-forge', { skip: process.platform === 'win32' }, async () => {
  const { root, cli } = makeWrapper();
  const pidFile = path.join(root, 'child.pid');
  const wrapper = spawn(process.execPath, [cli, 'wait', pidFile], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 250 && !fs.existsSync(pidFile); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(fs.existsSync(pidFile), 'stand-in never started');
    const exited = new Promise((resolve) => wrapper.once('exit', (code) => resolve(code)));
    wrapper.kill('SIGTERM');
    assert.equal(await exited, 0);
    assert.ok(fs.existsSync(`${pidFile}.stopped`), 'plain-forge did not receive SIGTERM');
  } finally {
    wrapper.kill('SIGKILL');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
