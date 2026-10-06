#!/usr/bin/env node
"use strict";

// Runs the pinned plain-forge dependency's CLI with every argument forwarded, so
// `npx @plainlang/regenerative-software install` behaves like `npx plain-forge install`.

const { spawn } = require("node:child_process");

if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("regenerative-software requires Node.js 22 or newer.");
  process.exit(1);
}

let cliPath;

try {
  cliPath = require.resolve("plain-forge/bin/cli.mjs");
} catch (error) {
  console.error(`Unable to locate the plain-forge CLI: ${error.message}`);
  process.exit(1);
}

// Launch Node directly (no shell) so arguments reach plain-forge unquoted and
// Windows .cmd shims are never involved.
const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: false,
});

let processError = false;
const handlers = new Map();

// Forward termination requests sent only to the wrapper (CI cancellation, process
// supervisors); otherwise the wrapper would exit and leave the installer running.
for (const signal of ["SIGINT", "SIGTERM"]) {
  const handler = () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  };

  handlers.set(signal, handler);
  process.on(signal, handler);
}

child.on("error", (error) => {
  processError = true;
  console.error(`Unable to run plain-forge: ${error.message}`);
});

child.once("close", (code, signal) => {
  for (const [name, handler] of handlers) {
    process.removeListener(name, handler);
  }

  if (processError) {
    process.exitCode = 1;
    return;
  }

  if (signal) {
    process.exitCode = signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1;

    // Re-raise so our parent sees a signal death, as it would for plain-forge itself.
    if (process.platform !== "win32") {
      process.kill(process.pid, signal);
    }

    return;
  }

  process.exitCode = code ?? 1;
});
