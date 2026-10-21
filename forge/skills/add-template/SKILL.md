---
name: add-template
description: >-
  Create or include a Liquid template in a ***plain spec file using
  {% include %} syntax. Use when the same spec content needs to be reused
  across multiple .plain files with different parameters.
---

# Add Template

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

Templates use Liquid syntax (`{% include %}`) to reuse the same spec content across multiple `.plain` files. Each inclusion can pass different parameters, producing tailored output from a single source. This is distinct from `import` and `requires` — templates are about textual reuse with parameterization, not module dependencies.

## When to Use Templates

- The **exact same spec structure** is needed in more than one `.plain` file.
- The reused content differs only in specific values (names, paths, config) that can be parameterized.
- You want a single source of truth for a pattern that appears in multiple modules.

## Format

### Including a Template

Use `{% include %}` with the template path and parameters:

```plain
{% include "console_app_template.plain", main_file_name: "app.py", app_name: "MyApp" %}
```

Parameters are passed as key-value pairs after the template path. Inside the template, parameters are accessed using Liquid variable syntax (`{{ main_file_name }}`).

### Writing a Template

Templates live in the `template/` directory. Only **variables** (`{{ variable_name }}`) are supported — conditionals, loops, and other Liquid features are not available:

```plain
***definitions***
- :{{ app_name }}MainFile: is the entry point file for :{{ app_name }}:.

***implementation reqs***
- :{{ app_name }}MainFile: should be called "{{ main_file_name }}".
```

## Workflow: Including an Existing Template

1. **Check the `template/` directory** to see what templates are available.
2. **Read the template** to understand what parameters it expects and what content it produces.
3. **Add the `{% include %}` statement** to the target `.plain` file with the correct parameters.
4. **Verify** that the expanded content does not introduce concept name collisions or duplicate sections.

## Workflow: Creating a New Template

1. **Identify the repeated pattern** — find spec content that is duplicated (or will be duplicated) across multiple `.plain` files.
2. **Extract the common content** into a new `.plain` file in the `template/` directory.
3. **Parameterize the differences** — replace the varying parts with Liquid variables.
4. **Update the original files** to use `{% include %}` instead of the duplicated content.

## Validation Checklist

- [ ] Template file is in the `template/` directory
- [ ] All varying parts are parameterized with Liquid variables
- [ ] All required parameters are passed at each `{% include %}` call site
- [ ] Expanded content does not introduce concept name collisions
- [ ] Template is used by more than one `.plain` file (otherwise, inline the content)
