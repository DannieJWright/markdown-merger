# Project Agent Instructions

## Architecture

- `packages/cli` owns all Markdown module processing: discovery, frontmatter parsing, store writes, inheritance resolution, abstract filtering, type routing, and merged emission. Do not duplicate parser, traversal, merge, or emission logic in any integration package.
- `packages/opencode-plugin` is restricted to OpenCode integration: it discovers bundled default roots, calls the CLI package's exported API, reads emitted agent output, and mutates OpenCode's supplied `agent` config.
- Integrations call exported CLI library functions directly. Do not invoke CLI commands or spawn subprocesses from an integration package.

## Module resolution

- Bundled plugin defaults are discovered dynamically from every immediate directory under the plugin package's `defaults/` directory. Do not hard-code `agents/` or `skills/`.
- Root directories are processed in order, defaults first and project roots second. When the same module path exists in more than one root, the later root wins.
- A module with `abstract: true` participates in inheritance but is never emitted and never registered as an agent or skill. This applies to bundled defaults and project files alike.
- A concrete module is emitted only after inheritance resolution.
- Output directories are selected by the module's `type` frontmatter field through `emitDirs.<type>`: `type: agent` uses `emitDirs.agent`, `type: skill` uses `emitDirs.skill`. Never infer an output directory from a source folder name.
- With no user configuration file, `type: agent` defaults to `.opencode/agents` and `type: skill` defaults to `.opencode/skills`, resolved against the working directory. A user configuration may replace these routes.
- Nested module paths are preserved in emitted directories and in OpenCode agent keys. `base/core/plan-o-strator` emits to `<emitDirs.agent>/base/core/plan-o-strator.md` and registers as `base/core/plan-o-strator`.
- Resolved module paths are assumed unique. Collision handling beyond the later-root override rule is deferred to a separate follow-up.
- A generated plugin agent replaces any existing OpenCode `agent` entry with the same key.

## Quality workflow

- Plugin tests must exercise the complete boundary: source roots through CLI build and emit, through the returned OpenCode config hook, to the mutated `agent` map.
- Generated defaults, stores, and emitted output must not be committed.
- Before declaring work complete, run the narrowest relevant checks, then cross-package validation when the change spans packages: `bun test --cwd packages/cli`, `bun test --cwd packages/opencode-plugin`, `bun test`, and `bun run typecheck`. Use `just` recipes for CLI workflows.
- For behavioral or multi-file changes, define acceptance cases and add or update focused `bun:test` coverage before implementation. Cover unit, pipeline, and integration-boundary behavior as applicable.
- Tests that alter `process.cwd()`, `MD_MERGER_CONFIG`, stores, or output directories must use unique temporary paths and restore state during cleanup, including failure paths.
- For cross-cutting or multi-session work, update the applicable spec, plan, or status artifact with decisions, affected files, validation evidence, known issues, and next actions. Do not create a status artifact for small isolated changes without a clear need.
- Cross-cutting CLI/plugin or inheritance changes require an independent review focused on correctness, compatibility, and regression coverage. Record findings with severity and file/line evidence.
- Parallel agents may explore or review independently. Writers must use separate worktrees or explicit non-overlapping file ownership, followed by reconciliation.
- Do not add runtime dependencies without documenting why existing Bun or Node APIs are insufficient and reviewing the dependency's security and supply-chain impact.

Apply validation, review, and parallelism proportionally to a change's scope and risk. This project does not require browser checks, MCP integrations, tracing, cost dashboards, evaluation sets, worktrees, or subagents for every change.
