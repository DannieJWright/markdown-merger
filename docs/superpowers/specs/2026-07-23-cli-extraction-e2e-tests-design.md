# CLI Command Extraction + E2E Test Infrastructure

**Date:** 2026-07-23

## Overview

Refactor `evo-ai` CLI to separate command dispatch into a testable entry point, relocate all tests from `src/` to `tests/`, and add E2E tests that validate the full build + emit pipeline against known input/output resource files.

## Architecture

### Current State

- `src/index.ts` — contains command dispatch (`switch(cmd)`), argument parsing, and main execution inline
- All tests live in `src/*.test.ts` alongside source modules
- `tests/resources/agents-root/` — sample input/output test fixture already exists
- Test runner: `bun test`, discovers `*.test.ts` files

### Target State

```
src/
  index.ts          # Thin shell: import { run } from "./cli"; run(process.argv.slice(2))
  cli.ts            # New: exports run(argv: string[]): Promise<void>
  config.ts         # Unchanged
  import.ts         # Unchanged
  emit.ts           # Unchanged
  store.ts          # Unchanged
  resolve.ts        # Unchanged
  frontmatter.ts    # Unchanged
  types.ts          # Unchanged
tests/
  unit/
    config.test.ts     # Relocated from src/config.test.ts
    import.test.ts     # Relocated from src/import.test.ts
    emit.test.ts       # Relocated from src/emit.test.ts
    resolve.test.ts    # Relocated from src/resolve.test.ts
    frontmatter.test.ts # Relocated from src/frontmatter.test.ts
    store.test.ts      # Relocated from src/store.test.ts
  e2e/
    e2e.test.ts      # New: full build + emit pipeline tests
  resources/
    agents-root/
      config.yaml           # Points to input/output/build directories
      input/                # Markdown input files (already exists)
        system/base.md
        agents/coder.md
        traits/caution.md
        traits/deletable.md
        skills/deletable-child.md
        skills/deletable-grandchild.md
      output/               # Expected output files (already exists)
        agents/agents_coder.md
        skills/skills_deletable-child.md
        skills/skills_deletable-grandchild.md
```

### `src/cli.ts` — Command Dispatch Module

```ts
export interface CliArgs {
  cmd: string;
  args: string[];
}

export function parseCliArgs(argv: string[]): CliArgs {
  const cmd = argv[0] ?? "help";
  const args = argv.slice(1);
  return { cmd, args };
}

export async function run(argv: string[]): Promise<void> {
  const { cmd, args } = parseCliArgs(argv);
  const config = await loadConfig();
  const storePath = config.storeFile;

  switch (cmd) {
    case "build": { /* existing logic */ }
    case "emit": { /* existing logic */ }
    case "render": { /* existing logic */ }
    case "stats": { /* existing logic */ }
    case "doctor": { /* existing logic */ }
    case "config": { /* existing logic */ }
    default: { /* help / usage */ }
  }
}
```

Key properties:
- `run(argv)` is the single testable entry point for the full CLI pipeline
- `parseCliArgs` is a pure function — independently testable
- Command handlers remain internal to the switch, no change to behavior
- Environment variable `EVO_CONFIG` controls config loading (already works via `loadConfig()`)

### Test Import Paths

Clean path aliases in `tsconfig.json` so tests import without deep relative paths:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@evo/*": ["src/*"]
    },
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

Tests import as:
```ts
import { run, parseCliArgs } from "@evo/cli";
import { build } from "@evo/import";
```

### E2E Test Structure

Each E2E test scenario:
1. Sets `EVO_CONFIG` to point to `tests/resources/<scenario>/config.yaml`
2. Cleans `tests/build/` directory
3. Calls `run(["build"])` — imports markdown files into store
4. Calls `run(["emit"])` — resolves inheritance and writes output files
5. Compares each generated file against the corresponding expected file in `tests/resources/<scenario>/output/`
6. Asserts exact file content match

### Config File for E2E

The existing `tests/resources/agents-root/config.yaml` already has the correct structure:
```yaml
project: evo-ai
version: "1"
maxInheritDepth: 5
storeFile: tests/build/prompts.jsonl
emitDirs:
  agent: tests/build/agents-root/output/agents
  skill: tests/build/agents-root/output/skills
rootDirs:
  - tests/resources/agents-root/input
```

### Unit Test Relocation

Each existing `src/*.test.ts` file moves to `tests/unit/`. The `beforeEach`/`afterEach` temp directory pattern is preserved. Only imports change from `./config` → `@evo/config`.

## Data Flow

```
E2E Test → sets EVO_CONFIG env var
  → run(["build"]) → loadConfig() reads tests/resources/*/config.yaml
  → build(glob input/*.md → parse → write store.jsonl)
  → run(["emit"]) → loadConfig() → emitAll(read store → resolve → write output/*.md)
  → diff generated output vs expected output/
```

## Testing Strategy

- **TDD**: E2E tests written first, failing against expected outputs, then implementation iterates toward passing
- **Unit tests**: Existing unit tests relocated, coverage preserved
- **Command dispatch tests**: New unit tests for `parseCliArgs` covering all command paths
- **E2E tests**: Validate full pipeline with real resource files
- **Build output verification**: Exact file content diff — any formatting or inheritance behavior change fails the test

## Remaining Uncertainty

None material. The approach is fully specified and bounded to existing functionality.
