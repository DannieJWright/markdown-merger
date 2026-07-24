# md-merger

Markdown-based AI agent/skill prompt management with inheritance. Flat 9-module source with a 4-stage core pipeline: **import → store → resolve → emit**. Supporting modules (`config`, `frontmatter`, `cli`, `types`, `index`) handle configuration, parsing, dispatch, and shared definitions. Zero npm dependencies.

## Overview

Md-merger is a CLI tool that manages AI agent and skill prompts as Markdown files with hierarchical inheritance. You write modular `.md` files with YAML frontmatter (`extends`, `type`, `abstract`), then Md-merger ingests them into a versioned JSONL store, resolves inheritance chains via topological sort, and emits merged output files. This lets you build DRY prompt libraries where shared traits, behaviors, and guidelines are defined once and inherited by many agents or skills.

The project is written in TypeScript with zero npm dependencies — all parsing, including YAML, is hand-rolled. It runs natively on Bun with no bundler or transpiler.

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌───────────────┐     ┌──────────┐
│  User Input  │────▶│ import   │────▶│   store       │────▶│ resolve  │────▶ emit ────▶ User Output
│  (.md files) │     │ (parse)  │     │  (JSONL file) │     │ (topology│     (merge)      (.md files)
└─────────────┘     └──────────┘     └───────────────┘     │ +inherit)│     └──────────┘
                                                           └──────────┘
```

### Module Responsibilities

| Module | Purpose |
|--------|---------|
| `index.ts` | CLI entry point (`#!/usr/bin/env bun`), routes `process.argv` to `cli.run()` |
| `cli.ts` | Command dispatcher — build, emit, render, stats, doctor, config |
| `config.ts` | Hand-rolled YAML parser for `.md-merger/config.yaml`, default config resolution |
| `import.ts` | Recursively glob `.md` files from `rootDirs`, parse, write records to JSONL store |
| `frontmatter.ts` | YAML frontmatter extraction, hierarchical section parsing (arbitrary nesting depth), markdown rendering |
| `store.ts` | Append-only JSONL store — `readStore`, `appendRecord`, `findLatest`, `updateOrCreate` |
| `resolve.ts` | Recursive inheritance resolution with cycle detection, topological sort (Kahn's algorithm), deep-clone section merging |
| `emit.ts` | Resolve all modules in topological order, route by `type`, write output `.md` files |
| `types.ts` | Shared interfaces: `Section`, `PromptRecord`, `Config`, `RenderResult` |

### Data Flow

1. **Build phase**: `import.ts` reads all `.md` files from configured `rootDirs`, parses frontmatter and sections via `frontmatter.ts`, writes versioned records to the append-only JSONL store via `store.ts`.
2. **Emit phase**: `emit.ts` reads all records, topologically sorts them (Kahn's algorithm), resolves each leaf module's full inheritance chain via `resolve.ts`, merges sections deep-clone-style (child overrides parent by name+level), renders to markdown, and writes output files routed by `type`.
3. **Render (ad-hoc)**: `render <module>` resolves a single module's full inheritance and prints merged markdown — useful for previewing without running emit.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ESNext) |
| Runtime | Bun (native execution, no bundler/transpiler) |
| Build | `tsc --noEmit` (type-checking only, no emission) |
| Task Runner | Just (`Justfile` wraps `bun` commands) |
| Testing | \`bun:test\` (104 tests across 8 files) |
| Dependencies | **Zero** — all parsing (including YAML) is hand-rolled. Only Node.js built-ins + Bun runtime APIs |
| License | MIT (plus MIT-licensed adapted code from Canopy) |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Just](https://just.systems/) (optional — `bun run` scripts in `package.json` work too)

### Installation

```bash
git clone https://github.com/your-org/md-merger.git
cd md-merger
```

No `npm install` required — zero dependencies.

> **Note:** `.md-merger/` is gitignored by default. Prompt source files in `.md-merger/agents-root/input/` will not be tracked unless you adjust your `.gitignore`.

### Basic Usage

```bash
# 1. Create config
mkdir -p .md-merger
cat > .md-merger/config.yaml << 'EOF'
project: my-project
version: "1"
rootDirs:
  - .md-merger/agents-root/input
emitDirs:
  agent: output/agents
  skill: output/skills
EOF

# 2. Create a module with frontmatter
mkdir -p .md-merger/agents-root/input/system
cat > .md-merger/agents-root/input/system/base.md << 'EOF'
---
abstract: true
---
## Role
You are an AI assistant.

## Constraints
Be helpful and safe.
EOF

cat > .md-merger/agents-root/input/agents/coder.md << 'EOF'
---
extends: [system/base]
type: agent
---
## Role
You are a coding assistant specializing in TypeScript.
EOF

# 3. Build + emit
just build
just emit
# Output: output/agents/coder.md (merged output with system/base sections + coder overrides)
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `md-merger build` | Import `.md` files from `rootDirs` into JSONL store |
| `md-merger emit` | Resolve inheritance, generate merged output `.md` files |
| `md-merger emit --dry-run` | Preview which files would be written without writing them |
| `md-merger render <module>` | Resolve and print a single module's merged content to stdout (argument is required) |
| `md-merger stats` | Show module counts: total, abstract, leaves (modules that nothing else extends) |
| `md-merger doctor` | Validate references, detect circular dependencies |
| `md-merger config show` | Print resolved config (path + values) |
| `md-merger help` / `-h` / `--help` / (no args) | Print usage information |

**Planned (stubbed):** `config set` and `config unset` — commands exist but only print a warning and exit. Use `$MD_MERGER_CONFIG` env var for configuration overrides until implemented.

Equivalent `just` commands exist for most of the above (`just build`, `just emit`, `just render <module>`, `just stats`, `just doctor`, etc.). Note: `config` subcommands are only available via direct CLI invocation (e.g. `bun ./src/index.ts config show`).

Equivalent `bun run` scripts exist in `package.json` (`bun run build`, `bun run emit`, etc.) for the same subset of commands. Note: `bun run render <module>` requires a module argument.

## Configuration

### Config File

Location: `.md-merger/config.yaml` (default) or `$MD_MERGER_CONFIG` env var. The env var also accepts HTTP URLs for remote config fetching. Hand-rolled YAML parser supports scalars, arrays (inline `[a, b]` or indented `- item`), booleans, integers, and nested key-value objects (how `emitDirs` works). No external YAML library.

### Config Schema

```yaml
# Project identifier (used in store record IDs) — required
project: my-project

# Config version string — required
version: "1"

# Maximum inheritance resolution depth (default: 5)
maxInheritDepth: 5

# Path to JSONL store file (default: prompts.jsonl)
storeFile: prompts.jsonl

# Type-keyed map of module types to output directories
emitDirs:
  agent: output/agents
  skill: output/skills

# Directories containing .md source modules
rootDirs:
  - .md-merger/agents-root/input
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `MD_MERGER_CONFIG` | Path to config file or HTTP URL for remote config (overrides default `.md-merger/config.yaml`) |

### Defaults

When no config file exists, the following defaults apply (from `types.ts`). Note: `project` and `version` are **required** — they have no defaults (`DEFAULT_CONFIG` is typed `Omit<Config, "project" | "version">`).

```typescript
{
  maxInheritDepth: 5,
  storeFile: "prompts.jsonl",
  emitDirs: { default: "output" },
  rootDirs: [".md-merger/agents-root/input"],
}
```

## Core Concepts

### Module Naming

Module names are derived from the relative path within a `rootDir`. A file at `.md-merger/agents-root/input/agents/coder.md` inside rootDir `.md-merger/agents-root/input` gets module name `agents/coder`. Multiple rootDirs act as independent namespaces; first match wins.

### Frontmatter

Each `.md` file supports YAML frontmatter:

```yaml
---
extends: [system/base, traits/caution]   # Inheritance chain
type: agent                              # Output routing key
abstract: true                           # Exclude from emit output
---
```

- `extends` — list of parent module names. Processed left-to-right; later parents override earlier ones.
- `type` — used as key into `emitDirs` for output routing. Modules without `type` are skipped during emit.
- `abstract` — modules marked abstract are included in inheritance resolution but excluded from emit output.

### JSONL Store

The store (`prompts.jsonl` by default) is an append-only JSONL file. Each line is a `PromptRecord`:

```json
{
  "id": "project-abc1",
  "name": "system/base",
  "version": 1,
  "sections": [...],
  "extends": [],
  "type": null,
  "frontmatter": {},
  "abstract": true,
  "status": "active",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

Every `build` appends new versioned records. `findLatest()` returns the highest version per name. Re-building always creates new versions — the store never deletes or overwrites. The effective store path is always resolved to an absolute path at runtime (relative `storeFile` values are joined against `process.cwd()`).

### Inheritance Resolution

Resolution is recursive with cycle detection and depth limiting:

1. Starting from a target module, resolve each ancestor in `extends` order
2. For each ancestor, recursively resolve _its_ ancestors first (post-order traversal)
3. Merge sections via `mergeSections()` — deep-clone merge where child sections override parent sections by `(name, level)` key
4. Merge frontmatter via shallow spread — child frontmatter overrides parent
5. Visited set with backtracking prevents infinite loops; depth counter prevents stack overflow

**Section merging semantics:**
- Child sections with matching `(name, level)` override parent body
- Empty body + no children = delete matching section (pruning mechanism)
- Parent section order preserved; new child sections appended
- Frontmatter merged via shallow spread across the chain, focal module wins

### Topological Sorting

Kahn's algorithm orders modules so parents always appear before children. Used during emit to guarantee that by the time a child module is emitted, all its inheritance has been resolved. If a cycle exists, the algorithm detects it and throws `CircularInheritanceError`.

### Hierarchical Sections

Sections are parsed by heading level (`##` = level 1, `###` = level 2, etc.). Headings inside fenced code blocks (```` ``` ```` or `~~~`) are ignored. Content before the first `##` heading becomes an "intro" section. Arbitrary nesting depth is supported (up to `######`).

## Development

### Project Structure

```
md-merger/
├── src/                    # Application source (9 modules)
│   ├── index.ts            # CLI entry point
│   ├── cli.ts              # Command dispatcher
│   ├── config.ts           # Config loading + YAML parser
│   ├── import.ts           # Markdown import pipeline
│   ├── frontmatter.ts      # Frontmatter extraction + section parsing
│   ├── store.ts            # JSONL store operations
│   ├── resolve.ts          # Inheritance resolution + topological sort
│   ├── emit.ts             # Output generation
│   └── types.ts            # Shared interfaces + defaults
├── tests/
│   ├── unit/               # Unit tests per module
│   ├── e2e/                # End-to-end pipeline test
│   ├── resources/          # Test fixtures
│   └── build/              # Test build artifacts (gitignored)
├── docs/                   # AI agent orchestration system prompt
├── .md-merger/                   # Runtime config + input files (gitignored)
├── bunfig.toml             # Disables peer-dependency installation (cosmetic with zero deps)
├── Justfile                # Task runner
├── package.json            # Scripts + metadata
├── tsconfig.json           # TypeScript config
└── LICENSE                 # MIT
```

### Development Workflow

```bash
# Type-check
just typecheck

# Run tests
just test

# Quick dev cycle: watch mode
bun run dev

# Build
just build

# Emit (preview changes first)
just emit --dry-run

# Validate store integrity
just doctor
```

## Testing

### Test Structure

- `tests/unit/` — Unit tests for each module (frontmatter, store, resolve, import, emit, config, cli)
- `tests/e2e/` — Full pipeline test: build → emit → diff against expected output
- `tests/resources/` — Test fixtures: sample input `.md` files, expected output, test config

### Running Tests

```bash
bun test                        # All tests
bun test tests/unit/frontmatter # Single test file
bun test --test-name-pattern "overrides"    # Filter by test name
```

### Writing Tests

Tests use Bun's built-in test runner (`bun:test`). Pattern:

```typescript
import { describe, test, expect } from "bun:test";
import { someExport } from "@md-merger/module-name";

describe("feature", () => {
  test("does something", () => {
    const result = someExport(input);
    expect(result).toBe(expected);
  });
});
```

- Use `@md-merger/*` path aliases (configured in `tsconfig.json`)
- For tests that need store/config: use `beforeEach`/`afterEach` to set `MD_MERGER_CONFIG` env var and clean up build directories
- See `tests/e2e/e2e.test.ts` for pattern of environment sandboxing

### Test Constraints (marked in test code)

Tests use constraint tags inline as comments (currently present in the E2E test file):
- **C2** — assert cwd/process state before each phase (config resolution depends on `process.cwd()`)
- **W3** — use actual config values instead of hardcoding paths

## Project Standards

### Coding Conventions

- **File naming**: lowercase kebab-case (`frontmatter.ts`, `config.ts`)
- **Exports**: named exports only, no default exports
- **Naming**: `camelCase` for functions/variables, `PascalCase` for interfaces/types
- **TypeScript**: strict mode, `noUncheckedIndexedAccess`, ESNext target/module
- **Dependencies**: zero npm dependencies. All parsing (YAML, markdown sections) is hand-rolled
- **Path aliases**: `@md-merger/*` maps to `./src/*` (configured in `tsconfig.json`)
- **Git**: Conventional Commits pattern. PR-linked commits use `(#N)` suffix

### Dependency Philosophy

The project intentionally has zero npm dependencies. Rationale:

- The YAML parser handles a known subset (scalars, arrays, booleans, integers) — full YAML spec is unnecessary
- Bun runtime provides all needed filesystem and crypto APIs
- Node.js built-ins (`node:fs`, `node:path`) are sufficient for I/O
- Fewer dependencies = fewer supply chain risks, faster installs, cleaner lockfiles

Zero runtime dependencies at present, though `@types/node` and `@types/bun` type definitions are used during development (referenced in `tsconfig.json` `types`).

If you need to add a dependency, justify it against these constraints.

### Adapted Code

`resolve.ts` and `emit.ts` are adapted from [Canopy](https://github.com/jayminwest/canopy) (MIT License). Attribution retained in source file headers.

## For AI Agents

### Quick Reference

| Question | Answer |
|----------|--------|
| How to run the CLI? | `bun ./src/index.ts <command>` or `just <command>` |
| How to run tests? | `bun test` |
| Entry point? | `src/index.ts` → `src/cli.ts` |
| How does a module get its name? | Relative path from `rootDir`, e.g. `agents/coder` from `agents/coder.md` |
| Where is the store? | Configured in `storeFile`, defaults to `prompts.jsonl`. Append-only JSONL. |
| How does inheritance work? | Recursive resolution with deep-clone section merge. See `resolve.ts` `resolve()` function. |
| How to add a new CLI command? | Add a `case` in `cli.ts` → `run()` switch statement. |
| Can I add npm dependencies? | No — project philosophy is zero dependencies. Justify if necessary. |
| How to test a new module? | Add `tests/unit/<module>.test.ts` using `bun:test` API |

### Working Pattern

1. Use `@md-merger/*` imports for module references in tests (path alias from `tsconfig.json`)
2. Tests should sandbox `MD_MERGER_CONFIG` in `beforeEach`/`afterEach` if they touch the store
3. Run `just typecheck && just test` after writing code to verify
4. For store-dependent tests, use a temporary build dir under `tests/build/`
5. Use `process.chdir()` carefully — config resolution depends on `process.cwd()` (see C2 constraint tag in e2e tests)

### Key Constraints

- **No default exports** — all modules use named exports only
- **No npm dependencies** — if you import something from `node_modules`, it's wrong
- **Strict TypeScript** — `noUncheckedIndexedAccess` means array/map access may return `undefined`
- **Mixed I/O APIs** — the codebase uses a mix of `node:fs/promises`, `node:fs`, and `Bun` runtime APIs depending on the operation. Follow existing patterns in each module rather than choosing one exclusively.
- **Append-only store** — never modify existing lines in the JSONL file, always append new versions
