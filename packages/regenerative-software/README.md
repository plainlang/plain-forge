# @plainlang/regenerative-software

Runs [plain-forge](https://github.com/plainlang/plain-forge) under the `@plainlang` name:

```bash
npx @plainlang/regenerative-software install
npx @plainlang/regenerative-software install --agent codex --scope project
npx @plainlang/regenerative-software update
npx @plainlang/regenerative-software uninstall
```

Every argument is forwarded to `plain-forge`, so prompts, output and exit codes are the
same as `npx plain-forge ...`. Requires Node.js 22 or newer.

## How it works

`plain-forge` is an exact-pinned dependency. `cli.cjs` resolves its `bin/cli.mjs` and
runs it with the same Node binary, no shell, inherited stdio, and SIGINT/SIGTERM
forwarded to the child. Each wrapper release runs exactly one `plain-forge` version.
`@latest` picks the newest wrapper, which then runs the version it pins.

## Releasing

Releases are automated. Re-pin `plain-forge` with
`npm install --save-exact plain-forge@latest`, merge, then publish a GitHub Release
tagged `regenerative-software-vX.Y.Z`. CI tests and smoke-tests the packed tarball,
then publishes. See
[RELEASING.md](../../RELEASING.md#releasing-plainlangregenerative-software).

If `plain-forge` ever moves `bin/cli.mjs` or adds an `exports` map, update the
`require.resolve` path in `cli.cjs`. Never add a `postinstall` script that runs the
installer; it must run only when the user invokes the command.
