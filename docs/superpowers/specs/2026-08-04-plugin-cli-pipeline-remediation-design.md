# Plugin CLI Pipeline Remediation Design

**Date:** 2026-08-04

## Problem

`packages/opencode-plugin` already correctly reuses the CLI's `loadConfig()`, `build()`, and `emitAll()` APIs for configured project sources. It also has a separate bundled-default fallback branch that traverses raw Markdown and directly injects raw prompts. That fallback branch partially duplicates responsibilities already owned by `packages/cli` and bypasses the CLI's frontmatter parsing, inheritance resolution, abstract-module filtering, type routing, and merged output generation.

This caused abstract default templates to appear as OpenCode agents after recursive default loading was added. It also prevents project agents from reliably extending plugin-provided bases in one inheritance graph.

## Goal

Process both bundled plugin defaults and project-defined modules through one CLI-owned build/emit pipeline, then inject only the resulting concrete agent outputs into OpenCode.

## Architecture

### Ownership boundary

`packages/cli` is the sole Markdown-processing core. It owns:

- recursive source discovery;
- YAML frontmatter parsing;
- module-path identity and ordered-root precedence;
- store writes and versioning;
- inheritance resolution;
- abstract-module filtering;
- type-based routing; and
- merged Markdown emission.

Emission routing is driven by each module's `type` frontmatter field. A concrete module with `type: agent` is written beneath the configured `emitDirs.agent` directory; a concrete module with `type: skill` is written beneath `emitDirs.skill`; and other concrete types use their corresponding `emitDirs.<type>` route. A module with no matching configured route is not emitted. Future agents must preserve this relationship and must not infer output directories from source folder names alone.

`packages/opencode-plugin` is an OpenCode adapter only. It owns:

- locating the bundled defaults root;
- combining it with configured project roots;
- invoking the CLI public API;
- reading CLI-emitted agent files; and
- mutating the supplied OpenCode `agent` configuration.

The plugin must not recursively traverse raw Markdown, parse frontmatter, decide whether a module is abstract or concrete, resolve inheritance, or inject raw source Markdown.

### Unified ordered roots

Each plugin initialization must process the complete bundled plugin defaults tree dynamically. Every directory directly under the plugin package's `defaults/` directory is an input root, not only `defaults/agents/`. The current tree contains `agents/` and `skills/`; future default module directories must be included without requiring plugin code changes.

The ordered input roots must be constructed as:

```text
[
  <plugin package>/defaults/<each immediate default directory>,
  ...<configured project rootDirs>
]
```

All bundled default roots are first so their abstract base modules and concrete modules are available to project modules through normal inheritance resolution. Project roots are later so a project module with the same module path overrides the bundled module.

The implementation must discover these default input directories dynamically from the installed package rather than hard-coding `agents/` or `skills/`. Non-directory entries directly under `defaults/` are not input roots.

The CLI's current import behavior is first-root-wins within a single build, using a `seen` module-path set in `packages/cli/src/import.ts`. It must change to later-root-wins. A later duplicate must be imported as the newer record so the existing store-version and emission deduplication logic selects the project definition.

The existing CLI regression named `first root dir wins when same module name exists in multiple roots` must be rewritten to assert this later-root-wins behavior.

### Abstract and concrete modules

An **abstract** module has frontmatter containing:

```yaml
abstract: true
```

Abstract modules may define shared content and may be extended by other modules. They participate in inheritance resolution but are never emitted as files and never registered as OpenCode agents or skills.

A **concrete** module does not set `abstract: true`. After its inheritance chain is resolved, it is emitted according to its `type` and configured output directory, then may be registered with its integration target.

This rule applies identically to bundled defaults and project-defined Markdown. No source location receives special treatment.

### Bundled default agent

The user has manually updated the concrete bundled agent at:

```text
packages/cli/defaults/agents/base/core/plan-o-strator.md
```

Its frontmatter must remain:

```yaml
---
type: agent
extends: [base/BasePrimaryAgent]
abstract: false
---
```

It is concrete and is emitted with its nested module path preserved. The plugin must inject it as:

```ts
opencodeConfig.agent["base/core/plan-o-strator"]
```

All existing `packages/cli/defaults/agents/base/**` templates remain abstract.

### Plugin execution flow

At initialization, the plugin must:

1. Capture its current working directory and switch to OpenCode's supplied project directory. The current plugin type declares this directory as required; retaining a defensive guard is allowed but must not change the normal contract.
2. Load the user's cwd-resolved configuration through the CLI package's exported API. This means calling the imported library functions directly; the plugin must not invoke CLI commands, spawn a CLI subprocess, or simulate command-line interactions.
3. Treat that loaded user configuration as the source of truth. Preserve every loaded project field, including its configured `rootDirs`, all `emitDirs` routes, `storeFile`, `project`, `version`, `maxInheritDepth`, and other settings. If no project config exists, retain the CLI package's normal exported default-config behavior.
4. Discover every immediate directory under the installed plugin package's `defaults/` directory and prepend those directories to the loaded `rootDirs`. Leave all project roots afterward so project modules override bundled modules with the same module path.
5. Invoke the CLI package's exported `build()` and `emitAll()` APIs once over the combined roots, using the user's configured `storeFile` and `emitDirs`. Do not create temporary directories, alternate stores, alternate output directories, or temporary CLI processes.
6. Read the concrete files emitted at the user's configured `emitDirs` locations, then mutate the OpenCode config hook argument's `agent` map with `{ prompt: content }` entries. The hook must mutate the supplied object and must not rely on a return value.
7. Restore the original working directory before returning hooks, including error paths. Any retained emitted paths must be absolute so hook execution does not depend on the restored cwd.


The plugin never runs CLI commands or subprocesses. It calls the CLI package's exported library API directly. It does not create temporary directories, alternate stores, or alternate output directories; it only augments the configured `rootDirs` for the unified build/emit pass.

### Nested module paths and agent keys

The current flat output behavior must be replaced. The CLI must preserve each concrete module's nested module path below its configured type-specific output root. For example:

```text
base/core/plan-o-strator
  -> <emitDirs.agent>/base/core/plan-o-strator.md
```

The plugin must derive an OpenCode agent key from the relative emitted path without `.md`:

```text
<emitDirs.agent>/base/core/plan-o-strator.md
  -> opencodeConfig.agent["base/core/plan-o-strator"]
```

This intentionally supersedes the earlier flat-directory direction. For this remediation, assume resolved module paths are unique; further collision handling is out of scope.

The package's existing defaults-copy mechanisms remain unchanged:

- `just build-local` copies CLI defaults into `packages/opencode-plugin/defaults/` for local development.
- `prepublishOnly` copies defaults for the published package.

Only the plugin's raw consumption of those copied Markdown files is replaced.

## Project Guidance

Create a repository-root `AGENTS.md` with these durable rules:

- `packages/cli` owns all Markdown module processing; do not duplicate parser, traversal, merge, or emission logic in integrations.
- `packages/opencode-plugin` is restricted to OpenCode integration concerns.
- Roots are processed in order; later roots override earlier modules with the same module path. Plugin defaults are first and project roots are second.
- Abstract modules are inheritance-only and are never emitted or registered, regardless of whether they are defaults or project files.
- Concrete modules are emitted only after CLI inheritance resolution.
- Emission directories are selected from the module's `type` frontmatter field: `type: agent` uses `emitDirs.agent`, `type: skill` uses `emitDirs.skill`, and other types use their corresponding `emitDirs.<type>` route. Do not infer output directories from source folder names.
- Plugin defaults are discovered dynamically from every immediate directory under `defaults/`; do not hard-code only `agents/` or `skills/` when adding future default module directories.
- Nested module paths are preserved in emitted directories and OpenCode agent keys.
- Plugin tests must exercise the complete boundary: source roots → CLI build/emit → returned OpenCode config hook → mutated `agent` map.
- Generated defaults, stores, and output artifacts must not be committed.
- Before declaring work complete, run the narrowest relevant checks, then cross-package validation when applicable: `bun test --cwd packages/cli`, `bun test --cwd packages/opencode-plugin`, `bun test`, and `bun run typecheck`. Use `just` for CLI workflows.
- For behavioral or multi-file changes, define acceptance cases and add or update focused `bun:test` coverage before implementation. Cover unit, pipeline, and integration-boundary behavior as applicable.
- Tests that alter `process.cwd()`, `MD_MERGER_CONFIG`, stores, or output directories must use unique temporary paths and restore state during cleanup, including failure paths.
- For cross-cutting or multi-session work, update the applicable spec, plan, or status artifact with decisions, affected files, validation evidence, known issues, and next actions. Do not create a status artifact for small isolated changes without a clear need.
- Cross-cutting CLI/plugin or inheritance changes require an independent review focused on correctness, compatibility, and regression coverage. Record findings with severity and file/line evidence.
- Parallel agents may explore or review independently. Writers must use separate worktrees or explicit non-overlapping file ownership, followed by reconciliation.
- Do not add runtime dependencies without documenting why existing Bun or Node APIs are insufficient and reviewing the dependency's security and supply-chain impact.

The project does not require browser checks, MCP integrations, tracing, cost dashboards, evaluation sets, worktrees, or subagents for every change. Apply validation, review, and parallelism proportionally to the change's scope and risk.

### Documentation consistency

This remediation must correct the related README documentation so it matches the new behavior and verified command surface:

- Replace the stale statement that multiple source roots use first-match-wins precedence with the approved ordered-root rule: later roots override earlier roots with the same module path.
- Do not claim root `bun run` commands exist unless they are defined in root `package.json`. Documentation must name the verified commands: `bun test`, `bun run typecheck`, package-scoped `bun test --cwd ...`, and applicable `just` recipes.

## Required Regression Coverage

The remediation must add or update automated tests for all of the following:

1. **Later-root precedence:** a duplicate module path in a defaults root and a project root resolves to the later project definition.
2. **Bundled abstract exclusion:** bundled modules marked `abstract: true` do not appear in `opencodeConfig.agent`.
3. **Concrete bundled emission:** `base/core/plan-o-strator` is built through the CLI pipeline, inherits content from its abstract base, is emitted at a nested output path, and is injected as `opencodeConfig.agent["base/core/plan-o-strator"]`.
4. **Project inheritance:** a concrete project module extending a bundled abstract base emits and injects merged inherited content.
5. **Project override:** a same-path project module overrides the corresponding bundled default content.
6. **Project abstract exclusion:** project-defined Markdown marked `abstract: true` is not injected.
7. **OpenCode hook contract:** tests invoke the returned `config` hook with an object and assert in-place mutation; they do not rely on a hook return value.
8. **Process isolation:** plugin tests preserve and restore `process.cwd()` and `MD_MERGER_CONFIG` state.
9. **No raw fallback loader:** plugin tests demonstrate defaults are processed through CLI-produced outputs, not direct raw Markdown loading.
10. **Nested output and key preservation:** a nested concrete module emits to a corresponding nested directory and registers under its complete slash-delimited module path, not a flat basename.
11. **Configuration preservation:** a project config with an additional non-agent `emitDirs` route is retained when the plugin prepends defaults and invokes the shared pipeline.

## Validation

The completed remediation must satisfy:

```text
bun test --cwd packages/cli
bun test --cwd packages/opencode-plugin
bun test
bun run typecheck
```

All commands must pass. The plugin test suite must prove the required regression cases, not merely import or export shape.

## Out of Scope

- Changes to npm publish workflows.
- Changes to the package `prepublishOnly` script.
- Adding concrete defaults other than `plan-o-strator`.
- OpenCode runtime testing against a published npm package; this remediation tests the plugin integration boundary locally.
