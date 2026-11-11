---
name: render
description: >-
  Trigger when asked to render, regen or regenerate a spec, module, or ***plain module.
  Do not call `render-spec` directly, always go through `render` skill.
---

# Render

Renders a `.plain` file with any available renderer. Generates the code from the ***plain specs.
The render target is the ***plain spec file, or the module no other module `requires`.

Never automatically pick a renderer if multiple renderers are available - always ask the user, unless the user already named one.
Never save the renderer preference in memory - unless the user explicitly asks you to save it.

## Known renderers

### pyro
- **Detect:** a `render-spec` or `pyro:render-spec` skill is available in this session.
- **Invoke:** `/render-spec <module>.plain` or `/pyro:render-spec <module>.plain`.
- **Output:** code in `plain_module/code/`, tests in `plain_module/tests/`, final copy in `dist/`,
  working files in `.pyro/`.

### codeplain
- **Detect:** `codeplain` is on `PATH`.
- **Invoke:** `codeplain <module>.plain --headless`, in the background, from the directory of the
  module's `config.yaml`.
- **Output:** code in `plain_modules/<module>/code/`, tests in
  `plain_modules/<module>/tests/<func-id>/`, final copy in `dist/`, log in `codeplain.log`.

## Instructions for rendering

1. Detect if pyro is available
2. Detect if codeplain is available
3. Renderer selection:
   - If the user named a renderer and it is available, continue with the named renderer.
   - If multiple renderers are available, ask the user which renderer to use, and then continue with the chosen renderer.
   - If only one renderer is available, continue with that renderer without asking the user.
   - If no renderer is available, abort rendering and report to user.
4. Invoke it on the render target.
5. Report success or failure, and where the output is.