# Project Agent Instructions

## Repository overview

This is a Bun/TypeScript workspace for `md-merger` and its OpenCode integration.

- `packages/cli` is the `@md-merger/cli` library and command-line tool. It discovers Markdown modules, resolves frontmatter and inheritance, writes stores, and emits merged artifacts.
- `packages/opencode-plugin` is the `@md-merger/opencode-plugin` integration. It locates its bundled defaults, invokes the CLI's exported API, reads emitted agents, and supplies them to OpenCode.
- `README.md` is the primary product and configuration reference. Consult it before changing public behavior or configuration semantics.
- `Justfile` provides convenient CLI recipes. Use its recipes for operations; its setup prose may lag behind the README.

## Tech stack

- **Runtime and package manager:** Bun, with Bun workspaces and `bun.lock` for dependency installation, scripts, tests, and CLI execution.
- **Language:** TypeScript compiled with strict ESNext settings. The repository enables `noUncheckedIndexedAccess` and includes Bun and Node type definitions.
- **CLI:** `@md-merger/cli`, a Bun/TypeScript command-line tool and library. It uses exported library functions so integrations can run the pipeline in-process.
- **OpenCode integration:** `@md-merger/opencode-plugin`, using the `@opencode-ai/plugin` API to inject generated agent configuration.
- **Content formats:** Markdown modules with frontmatter, plus YAML project configuration. The repository uses hand-rolled Markdown/frontmatter and YAML parsing rather than adding a runtime parser dependency.
- **Testing:** Bun's built-in `bun:test` framework, including CLI tests and serial plugin integration tests with temporary fixtures.
- **Task runner:** Just recipes in `Justfile` for build, emit, render, doctor, stats, test, and typecheck workflows.
- **Build and publishing:** The CLI is bundled with Bun before publishing; package scripts handle build and publish preparation.

## Recommended commands

Run these from the repository root unless a command specifies `--cwd`:

| Change scope | Run first | Also run when applicable |
| --- | --- | --- |
| CLI only | `bun test --cwd packages/cli` | `bun run typecheck` |
| OpenCode plugin only | `bun test --cwd packages/opencode-plugin` | `bun run typecheck` |
| CLI/plugin boundary or shared behavior | `bun test` and `bun run typecheck` | `bun run bundle --cwd packages/cli` when CLI bundle or publish inputs change |
| CLI workflows | `just test`, `just typecheck` | `just build`, `just emit`, `just render`, `just doctor`, or `just stats` as relevant |

`bun test` and `bun run typecheck` are the repository-wide baseline. The CLI package's `prepublishOnly` script bundles it before publishing. This documentation change needs no runtime test suite, but keep these commands current when modifying this file.

## Architecture boundaries

- `packages/cli` owns all Markdown module processing: discovery, frontmatter parsing, store writes, inheritance resolution, abstract filtering, type routing, and merged emission. Do not duplicate parser, traversal, merge, or emission logic in any integration package.
- `packages/opencode-plugin` is restricted to OpenCode integration: it discovers bundled default roots, calls the CLI package's exported API, reads emitted agent output, and mutates OpenCode's supplied `agent` config.
- Integrations call exported CLI library functions directly. Do not invoke CLI commands or spawn subprocesses from an integration package.
- Keep public CLI behavior in the CLI package and keep OpenCode-specific behavior in the plugin. A change that needs both packages should preserve this division rather than introducing a second pipeline.

## Module resolution and emission invariants

- Bundled plugin defaults are discovered dynamically from every immediate directory under the plugin package's `defaults/` directory. Do not hard-code `agents/` or `skills/`.
- Root directories are processed in order, defaults first and project roots second. When the same module path exists in more than one root, the later root wins.
- A module with `abstract: true` participates in inheritance but is never emitted and never registered as an agent or skill. This applies to bundled defaults and project files alike.
- A concrete module is emitted only after inheritance resolution. Preserve inheritance behavior when adding module types or changing frontmatter handling.
- Output directories are selected by the module's `type` frontmatter field through `emitDirs.<type>`: `type: agent` uses `emitDirs.agent`, `type: skill` uses `emitDirs.skill`. Never infer an output directory from a source folder name.
- With no user configuration file, `type: agent` defaults to `.opencode/agents` and `type: skill` defaults to `.opencode/skills`, resolved against the working directory. A user configuration may replace these routes.
- Nested module paths are preserved in emitted directories and in OpenCode agent keys. `base/core/plan-o-strator` emits to `<emitDirs.agent>/base/core/plan-o-strator.md` and registers as `base/core/plan-o-strator`.
- Resolved module paths are assumed unique. Collision handling beyond the later-root override rule is deferred to a separate follow-up; do not add incompatible collision behavior incidentally.
- A generated plugin agent replaces any existing OpenCode `agent` entry with the same key.

### Root export manifest syntax

- A source root may optionally contain `md-merger-root.yaml`. This is a deliberately restricted YAML subset for publishing bare `extends` aliases; do not treat it as general YAML or reuse the project config parser without preserving these rules.
- The restricted grammar above applies only to `md-merger-root.yaml`; user `.md-merger/config.yaml` files use the project configuration parser and its documented configuration syntax, not root-export entries.
- The only allowed top-level content is exactly one unindented `exports:` key. The mapping may be empty. Blank lines, full-line comments, and LF or CRLF line endings are allowed.
- Each export entry must be indented by exactly two spaces and use an unquoted, non-empty scalar alias and target: `  alias: relative/module.md`.
- Reject quoted scalars, inline comments, inline maps, nested values, list entries, additional/repeated/indented top-level keys, and any other indentation width.
- Export aliases are non-empty bare names and cannot contain `/` or `\`. Targets must refer to a Markdown module in the same root.
- Normalize target separators to `/` and remove one trailing `.md`. Reject `.` or `..` segments and paths that are absolute under either POSIX or Windows semantics, including drive-letter and UNC paths.
- Load and validate every root manifest before appending any store records. Merge valid exports in configured root order; a later root replaces an earlier root's same alias.
- During build, slash-qualified `extends` references are exact module paths and bypass exports. Bare references consult the combined export map, then fall back to an exact root-level module name when unexported. Store only canonical extensionless module paths so resolver, topology, doctor, and emit remain alias-unaware.

## TypeScript and dependency conventions

- The workspace uses strict TypeScript, including `noUncheckedIndexedAccess`. Handle possibly absent values explicitly instead of weakening types or using unchecked assertions.
- Prefer named exports, lowercase kebab-case filenames, and `@md-merger/*` workspace aliases.
- The CLI intentionally relies on Bun and Node APIs rather than external runtime packages. Do not add a runtime dependency without documenting why existing APIs are insufficient and reviewing security and supply-chain impact.
- The plugin has declared runtime dependencies on OpenCode's plugin package and the workspace CLI package. Preserve package boundaries; do not move CLI processing into the plugin to avoid a dependency.

## Testing and generated artifacts

- Plugin tests must exercise the complete boundary when relevant: source roots through CLI build and emit, through the returned OpenCode config hook, to the mutated `agent` map.
- For behavioral or multi-file changes, define acceptance cases and add or update focused `bun:test` coverage before implementation. Cover unit, pipeline, and integration-boundary behavior as applicable.
- Tests that alter `process.cwd()`, `MD_MERGER_CONFIG`, stores, or output directories must use unique temporary paths and restore state during cleanup, including failure paths. Plugin integration tests are serial for this reason.
- Generated plugin defaults, stores, emitted output, `dist`, and test build artifacts must not be committed. In particular, `packages/opencode-plugin/defaults/` is generated; do not confuse it with committed source defaults in `packages/cli/defaults/`.
- Run the narrowest relevant checks during development, then cross-package validation when a change crosses the CLI/plugin boundary. Use `just` recipes for manual CLI workflows rather than recreating their shell commands.

## Change hygiene

- Use Conventional Commit-style messages. The README's `(#N)` suffix is a documented preference for PR-linked commits, not an enforced repository rule.
- For cross-cutting or multi-session work, update an applicable spec, plan, or status artifact with decisions, affected files, validation evidence, known issues, and next actions. Do not create a status artifact for small isolated changes without a clear need.
- Cross-cutting CLI/plugin or inheritance changes require an independent review focused on correctness, compatibility, and regression coverage. Record findings with severity and file/line evidence.
- Parallel exploration or review is safe when independent. Concurrent writers must use separate worktrees or explicit non-overlapping file ownership, followed by reconciliation.
- Apply validation, review, and parallelism proportionally to a change's scope and risk. This project does not require browser checks, MCP integrations, tracing, cost dashboards, evaluation sets, worktrees, or subagents for every change.
