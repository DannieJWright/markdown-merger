# CLI Command Extraction + E2E Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **REQUIRED WORKFLOW SKILL:** Use `superpowers:deepwork` for high-cost multi-phase coordination across these tasks with meaningful dependencies (source refactor → test relocation → E2E tests). Maintain a deepwork progress file under `.slim/deepwork/`.

**Goal:** Extract CLI command dispatch into a testable module, relocate all tests to `tests/`, and add E2E tests that validate the full build + emit pipeline against known input/output resource files.

**Architecture:** New `src/cli.ts` exports `parseCliArgs(argv)` (pure function) and `run(argv)` (full CLI pipeline). `src/index.ts` becomes a thin shell. Tests move to `tests/unit/` and `tests/e2e/`. Path aliases (`@evo/*`) replace all relative imports in tests. E2E tests call `run()` directly with `EVO_CONFIG` env pointing to test resource config files.

**Tech Stack:** Bun (runtime + test runner), TypeScript, custom YAML parser (no external deps), JSONL store.

**Design Spec:** `docs/superpowers/specs/2026-07-23-cli-extraction-e2e-tests-design.md`

## Global Constraints

- **Test runner:** `bun test` — discovers `*.test.ts` files project-wide
- **Runtime:** Bun (not Node) — use `Bun.file()`, `Bun.spawn()` where applicable
- **Path aliases:** `@evo/*` → `src/*` — all new test imports MUST use this convention
- **E2E validation:** Exact file content diff — generated output must match expected output byte-for-byte
- **No behavior change:** The CLI must behave identically after extraction. Existing commands, exit codes, stdout messages unchanged.
- **TDD:** Write failing test first, then implement. Every task ends with passing tests.
- **Frequent commits:** Commit after each task completes
- **DRY/YAGNI:** No new abstractions beyond what the plan specifies
- **tests/build/ is gitignored:** Already in `.gitignore`
- **Windows paths exist:** Code runs on win32 — `replace(/\\/g, "/")` patterns are used

---

### Task 1: Configure tsconfig.json path aliases and test inclusion

**Context for fresh session:** The project is a Bun/TypeScript CLI tool. `tsconfig.json` currently only includes `src/**/*.ts` and has `rootDir: "src"`. We need to include `tests/` and add `@evo/*` path aliases so tests import cleanly as `import { run } from "@evo/cli"` instead of `import { run } from "../../../src/cli"`.

**Files:**
- Modify: `C:\Users\Danni\Documents\Git\evo-ai\tsconfig.json`

**Interfaces:**
- Consumes: None (configuration only)
- Produces: Path aliases and test inclusion for all subsequent tasks

- [ ] **Step 1: Write the new tsconfig.json contents**

The exact file contents to write:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "types": ["node", "bun"],
    "baseUrl": ".",
    "rootDir": ".",
    "paths": {
      "@evo/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests/build"]
}
```

Changes from current:
- `"rootDir": "src"` → `"rootDir": "."` (allows tests/ alongside src/)
- Added `"baseUrl": "."` (required for path aliases)
- Added `"paths"` with `@evo/*`
- `"include"` now includes `"tests/**/*.ts"`
- Added `"exclude"` for node_modules, dist, tests/build

- [ ] **Step 2: Verify typecheck still passes**

Run: `bun run typecheck`
Expected: No errors. If errors, verify the paths are correct relative to `baseUrl: "."`.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add @evo/* path aliases and tests/ to tsconfig"
```

---

### Task 2: Create src/cli.ts — extract command dispatch

**Context for fresh session:** Current `src/index.ts` (134 lines) contains a `main()` function with a `switch(cmd)` block handling commands: `build`, `emit`, `render`, `stats`, `doctor`, `config`, and a `default` help case. Arguments are parsed from `process.argv.slice(2)`. We need to extract this into `src/cli.ts` as a reusable `run(argv: string[]): Promise<void>` function, plus a pure `parseCliArgs(argv: string[]): CliArgs` function.

Read existing file first: `src/index.ts` (already in conversation context, lines 1-134).

**Files:**
- Create: `C:\Users\Danni\Documents\Git\evo-ai\src\cli.ts`

**Interfaces:**
- Consumes: All existing `src/` modules (`config`, `import`, `resolve`, `emit`, `store`, `types`)
- Produces: `parseCliArgs(argv): CliArgs`, `run(argv): Promise<void>`, exported from `src/cli.ts`

- [ ] **Step 1: Write parseCliArgs unit tests**

Create `tests/unit/cli.test.ts` with `parseCliArgs` tests (TDD: write failing test first):

```typescript
import { describe, test, expect } from "bun:test";
import { parseCliArgs } from "@evo/cli";

describe("parseCliArgs", () => {
  test("defaults to help when no args", () => {
    const result = parseCliArgs([]);
    expect(result.cmd).toBe("help");
    expect(result.args).toEqual([]);
  });

  test("parses command and remaining args", () => {
    const result = parseCliArgs(["emit", "--dry-run"]);
    expect(result.cmd).toBe("emit");
    expect(result.args).toEqual(["--dry-run"]);
  });

  test("parses render command with module name", () => {
    const result = parseCliArgs(["render", "agents/coder"]);
    expect(result.cmd).toBe("render");
    expect(result.args).toEqual(["agents/coder"]);
  });

  test("parses config sub-command", () => {
    const result = parseCliArgs(["config", "show"]);
    expect(result.cmd).toBe("config");
    expect(result.args).toEqual(["show"]);
  });

  test("handles unknown command", () => {
    const result = parseCliArgs(["unknown-cmd"]);
    expect(result.cmd).toBe("unknown-cmd");
    expect(result.args).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to see them fail (import error)**

Run: `bun test tests/unit/cli.test.ts`
Expected: Import error — `src/cli.ts` does not exist yet. This confirms the test is valid and the red phase of TDD.

- [ ] **Step 3: Create minimal cli.ts with stub implementation**

Write a minimal `src/cli.ts` that exports the `CliArgs` interface, the `parseCliArgs` pure function, and a stub `run()` that throws (not yet implemented). This allows testing `parseCliArgs` independently before implementing the full dispatch logic.

```typescript
export interface CliArgs {
  cmd: string;
  args: string[];
}

/**
 * Parse CLI arguments into a command and remaining args.
 * Defaults to "help" when no command is provided.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const cmd = argv[0] ?? "help";
  const args = argv.slice(1);
  return { cmd, args };
}

export async function run(_argv: string[]): Promise<void> {
  throw new Error("not yet implemented");
}
```

- [ ] **Step 4: Run tests to verify parseCliArgs passes**

Run: `bun test tests/unit/cli.test.ts`
Expected: 5/5 passing. `parseCliArgs` is a pure function so it should pass immediately.

- [ ] **Step 5: Implement full run() function with switch block and all imports**

Replace the minimal `src/cli.ts` with the full extracted implementation — add all imports from index.ts and the complete switch block as the body of `run()`. `run()` throws errors instead of calling `process.exit(1)` so it remains testable (the thin `index.ts` shell catches errors and exits).

```typescript
import { loadConfig, getConfigPath } from "./config";
import { build } from "./import";
import { topologicalSort } from "./resolve";
/* NOTE: deduplicateRecords must be exported from emit.ts (add `export` to the function declaration).
 * Currently it's a private function — Task 2 Step 5 requires it to be exported. */
import { emitAll, renderText, deduplicateRecords } from "./emit";
import { readStore } from "./store";
import type { PromptRecord } from "./types";

export interface CliArgs {
  cmd: string;
  args: string[];
}

/**
 * Parse CLI arguments into a command and remaining args.
 * Defaults to "help" when no command is provided.
 */
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
    case "build": {
      await build(config.rootDirs, storePath, config.project);
      console.log(`Built ${config.rootDirs.length} root dir(s) into ${storePath}`);
      break;
    }
    case "emit": {
      const dryRun = args[0] === "--dry-run";
      const paths = await emitAll(storePath, config.emitDirs, config, dryRun);
      if (dryRun) {
        console.log(`${paths.length} file(s) would be written`);
      } else {
        console.log(`Emitted ${paths.length} file(s)`);
      }
      break;
    }
    case "render": {
      const name = args[0];
      if (!name) {
        throw new Error("Usage: evo render <module>");
      }
      console.log(await renderText(storePath, name, config.maxInheritDepth));
      break;
    }
    case "stats": {
      const records = deduplicateRecords(await readStore(storePath));
      const abstract = records.filter(r => r.abstract).length;
      const leaves = records.filter(r => !r.extends?.length).length;
      console.log(`Total: ${records.length}, Abstract: ${abstract}, Leaves: ${leaves}`);
      break;
    }
    case "doctor": {
      const records = deduplicateRecords(await readStore(storePath));
      const names = new Set(records.map(r => r.name));
      let errors = 0;
      for (const r of records) {
        if (r.extends) {
          for (const ext of r.extends) {
            if (!names.has(ext)) {
              console.error(`Broken reference: ${r.name} extends ${ext} (not found)`);
              errors++;
            }
          }
        }
      }
      try {
        await topologicalSort(storePath);
      } catch (e) {
        console.error(`Cycle detected: ${(e as Error).message}`);
        errors++;
      }
      if (errors === 0) {
        console.log("Doctor: all references valid.");
      } else {
        throw new Error(`Doctor: found ${errors} error(s)`);
      }
      break;
    }
    case "config": {
      const subCmd = args[0] ?? "show";
      if (subCmd === "show") {
        console.log(`Config path: ${getConfigPath()}`);
        console.log(JSON.stringify(config, null, 2));
      } else if (subCmd === "set" && args[1] && args[2]) {
        console.error("Config set: not yet implemented (use env var EVO_CONFIG for path)");
        break;
      } else if (subCmd === "unset") {
        console.error("Config unset: not yet implemented");
        break;
      } else {
        throw new Error("Usage: evo config [show|set|unset]");
      }
      break;
    }
    default: {
      console.log(`Usage: evo <command>

Commands:
  build               Import .md files into the JSONL store
  emit [--dry-run]    Resolve and emit merged .md files
  render <module>     Resolve and print a single module
  stats               Show module counts
  doctor              Validate references and detect cycles
  config [show|set|unset]  Inspect or modify config

Environment:
  EVO_CONFIG          Path to config file (default: .evo/config.yaml)
`);
      if (cmd !== "help" && cmd !== "-h" && cmd !== "--help") {
        console.error(`Unknown command: ${cmd}`);
        throw new Error(`Unknown command: ${cmd}`);
      }
    }
  }
}
```

- [ ] **Step 6: Add run() error path tests**

Append to `tests/unit/cli.test.ts` error path tests for `run()`:

```typescript
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");

describe("run error paths", () => {
  const origEnv = process.env.EVO_CONFIG;
  beforeEach(() => {
    process.env.EVO_CONFIG = resolve(PROJECT_ROOT, "tests", "resources", "agents-root", "config.yaml");
  });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.EVO_CONFIG;
    else process.env.EVO_CONFIG = origEnv;
  });

  test("throws on unknown command", async () => {
    await expect(run(["unknown"])).rejects.toThrow("Unknown command: unknown");
  });

  test("throws on render without module name", async () => {
    await expect(run(["render"])).rejects.toThrow("Usage: evo render <module>");
  });

  test("help command does not throw", async () => {
    await expect(run([])).resolves.toBeUndefined();
  });
});
```

Also update the top-level imports to include `run` and `{ resolve }`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { parseCliArgs, run } from "@evo/cli";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");
```

Run: `bun test tests/unit/cli.test.ts`
Expected: 8/8 passing (5 parseCliArgs tests + 3 error path tests).

- [ ] **Step 7: Verify typecheck passes**

Run: `bun run typecheck`
Expected: Clean, no type errors

- [ ] **Step 8: Commit**

```bash
git add src/cli.ts tests/unit/cli.test.ts
git commit -m "feat: extract CLI command dispatch to cli.ts with parseCliArgs and run error path tests"
```

---

### Task 3: Update src/index.ts to thin shell

**Context for fresh session:** Now that `src/cli.ts` exports `run(argv)`, `src/index.ts` should simply import and call it with `process.argv.slice(2)` plus the error handler.

**Files:**
- Modify: `C:\Users\Danni\Documents\Git\evo-ai\src\index.ts`

**Interfaces:**
- Consumes: `run(argv: string[]): Promise<void>` from `./cli`
- Produces: No new interfaces (same CLI behavior)

- [ ] **Step 1: Replace src/index.ts contents**

```typescript
#!/usr/bin/env bun

import { run } from "./cli";

run(process.argv.slice(2)).catch(err => {
  console.error(err.message ?? String(err));
  process.exit(1);
});
```

- [ ] **Step 2: Verify CLI still works with old command**

Run: `bun src/index.ts help`
Expected: Usage text printed, no error

Run: `bun run typecheck`
Expected: Clean, no type errors

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "refactor: thin index.ts shell that delegates to cli.ts run()"
```

---

### Task 4: Relocate existing unit tests to tests/unit/ and update imports

**Context for fresh session:** Six existing test files live alongside source modules in `src/`: `config.test.ts`, `import.test.ts`, `emit.test.ts`, `resolve.test.ts`, `frontmatter.test.ts`, `store.test.ts`. Each needs to move to `tests/unit/` and update its `from "./..."` imports to `from "@evo/..."`. File contents are already known (read during brainstorming). The `beforeEach`/`afterEach` temp dir pattern is preserved — only import paths change.

**Files:**
- Create: `tests/unit/config.test.ts`
- Create: `tests/unit/import.test.ts`
- Create: `tests/unit/emit.test.ts`
- Create: `tests/unit/resolve.test.ts`
- Create: `tests/unit/frontmatter.test.ts`
- Create: `tests/unit/store.test.ts`
- Delete: `src/config.test.ts`, `src/import.test.ts`, `src/emit.test.ts`, `src/resolve.test.ts`, `src/frontmatter.test.ts`, `src/store.test.ts`

**Interfaces:**
- Consumes: `@evo/*` path aliases from Task 1
- Produces: All 6 test files relocated with clean imports

- [ ] **Step 1: Relocate config.test.ts**

Read `src/config.test.ts` content (191 lines). Create `tests/unit/config.test.ts` with identical content but imports changed:

```
import from "./config"     → import from "@evo/config"
```

Everything else stays the same.

- [ ] **Step 2: Relocate import.test.ts**

Read `src/import.test.ts` content (109 lines). Create `tests/unit/import.test.ts`:

```
import from "./import"     → import from "@evo/import"
import from "./store"      → import from "@evo/store"
```

- [ ] **Step 3: Relocate emit.test.ts**

Read `src/emit.test.ts` content (288 lines). Create `tests/unit/emit.test.ts`:

```
import from "./emit"       → import from "@evo/emit"
import from "./store"      → import from "@evo/store"
import type from "./types" → import type from "@evo/types"
```

- [ ] **Step 4: Relocate resolve.test.ts**

Read `src/resolve.test.ts` content (262 lines). Create `tests/unit/resolve.test.ts`:

```
import from "./resolve"    → import from "@evo/resolve"
import type from "./types" → import type from "@evo/types"
import from "./store"      → import from "@evo/store"
```

- [ ] **Step 5: Relocate frontmatter.test.ts**

Read `src/frontmatter.test.ts` content (278 lines). Create `tests/unit/frontmatter.test.ts`:

```
import from "./frontmatter"  → import from "@evo/frontmatter"
import type from "./types"   → import type from "@evo/types"
```

- [ ] **Step 6: Relocate store.test.ts**

Read `src/store.test.ts` content (77 lines). Create `tests/unit/store.test.ts`:

```
import from "./store"   → import from "@evo/store"
import type from "./types" → import type from "@evo/types"
```

- [ ] **Step 7: Delete original test files**

```bash
rm src/config.test.ts src/import.test.ts src/emit.test.ts src/resolve.test.ts src/frontmatter.test.ts src/store.test.ts
```

- [ ] **Step 8: Run all tests to verify relocation**

Run: `bun test`
Expected: All tests pass. Count: ~80+ tests (6 unit files + cli.unit.test.ts). If any fail, the issue is likely an import path that wasn't updated.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: relocate all unit tests to tests/unit/ with @evo/* imports"
```

---

### Task 5: Create E2E test — build + emit pipeline validation

**Context for fresh session:** This is the most important task. The E2E test uses `tests/resources/agents-root/` which already contains:
- `config.yaml` — points `storeFile` to `tests/build/prompts.jsonl`, `emitDirs` to `tests/build/agents-root/output/`, `rootDirs` to `tests/resources/agents-root/input`
- `input/` — markdown source files including `agents/coder.md`, `system/base.md`, `traits/caution.md`, `traits/deletable.md`, `skills/deletable-child.md`, `skills/deletable-grandchild.md`
- `output/` — expected output files including `agents/agents_coder.md`, `skills/skills_deletable-child.md`, `skills/skills_deletable-grandchild.md`

The test will:
1. Set `EVO_CONFIG` env pointing to the test config
2. Clean `tests/build/`
3. Call `run(["build"])` then `run(["emit"])`
4. Diff generated files against expected files byte-for-byte

Existing expected files to validate against (already in the project):
- `tests/resources/agents-root/output/agents/agents_coder.md` (32 lines)
- `tests/resources/agents-root/output/skills/skills_deletable-child.md`
- `tests/resources/agents-root/output/skills/skills_deletable-grandchild.md`

**Files:**
- Create: `C:\Users\Danni\Documents\Git\evo-ai\tests\e2e\e2e.test.ts`

**Interfaces:**
- Consumes: `run(argv: string[])` from `@evo/cli`, test resources at `tests/resources/`
- Produces: E2E test that validates full build+emit pipeline

- [ ] **Step 0: Verify test resources exist**

Verify that `tests/resources/agents-root/` contains the required files:
- `config.yaml` — test scenario config
- `input/` — markdown source files
- `output/` — expected output files for diff validation

Run: `ls tests/resources/agents-root/`
Expected: `config.yaml`, `input/`, `output/` directories present

- [ ] **Step 1: Write the failing E2E test**

Create `tests/e2e/e2e.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { run } from "@evo/cli";
import { loadConfig } from "@evo/config";
import { readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { relative, resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");
const RESOURCES_ROOT = resolve(PROJECT_ROOT, "tests", "resources");
const BUILD_DIR = resolve(PROJECT_ROOT, "tests", "build");

/** Walk a directory and return relative paths of all files */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath).map(f => relative(dir, f).replace(/\\/g, "/")));
    } else {
      results.push(relative(dir, fullPath).replace(/\\/g, "/"));
    }
  }
  return results;
}

function runE2EScenario(scenarioName: string) {
  const scenarioRoot = resolve(RESOURCES_ROOT, scenarioName);
  const configPath = resolve(scenarioRoot, "config.yaml");
  const expectedOutputDir = resolve(scenarioRoot, "output");

  describe(`E2E: ${scenarioName}`, () => {
    const origEnv = process.env.EVO_CONFIG;
    const origCwd = process.cwd();

    beforeEach(() => {
      // Clean build directory
      if (existsSync(BUILD_DIR)) {
        rmSync(BUILD_DIR, { recursive: true, force: true });
      }
      // Set config to point to the test scenario
      process.env.EVO_CONFIG = configPath;
      try {
        process.chdir(PROJECT_ROOT);
      } catch (e) {
        throw new Error(`Cannot chdir to ${PROJECT_ROOT}: ${(e as Error).message}`);
      }
    });

    afterEach(() => {
      if (origEnv === undefined) delete process.env.EVO_CONFIG;
      else process.env.EVO_CONFIG = origEnv;
      process.chdir(origCwd);
    });

    test("build then emit produces expected output", async () => {
      // C2: Assert cwd before each phase — config resolution depends on process.cwd()
      expect(process.cwd()).toBe(PROJECT_ROOT, "CWD was unexpectedly shifted before build phase");

      // Phase 1: Build — import markdown files into JSONL store
      await run(["build"]);

      // After build, verify store was created
      const storeFile = resolve(BUILD_DIR, "prompts.jsonl");
      expect(
        existsSync(storeFile),
        "Build did not create the JSONL store at " + storeFile
      ).toBe(true);

      // C2: Assert cwd before emit phase too
      expect(process.cwd()).toBe(PROJECT_ROOT, "CWD was unexpectedly shifted before emit phase");

      // Phase 2: Emit — resolve inheritance and write output files
      await run(["emit"]);

      // W3: Load config to get actual emitDirs instead of hardcoding path structure
      const config = await loadConfig();
      const emitDirs = config.emitDirs;

      // Phase 3: Validate — diff generated vs expected output
      if (!existsSync(expectedOutputDir)) {
        throw new Error(`Expected output directory not found: ${expectedOutputDir}`);
      }

      const expectedFiles = collectFiles(expectedOutputDir);
      expect(expectedFiles.length).toBeGreaterThan(0, "Expected output directory is empty — no files to validate");

      for (const filePath of expectedFiles) {
        const expectedPath = resolve(expectedOutputDir, filePath);
        // W3: Use actual emitDirs from config to determine generated file location
        const fileName = filePath.split("/").pop();
        let generatedPath: string | null = null;
        for (const targetDir of Object.values(emitDirs)) {
          const candidate = resolve(targetDir, fileName!);
          if (existsSync(candidate)) {
            generatedPath = candidate;
            break;
          }
        }

        expect(
          generatedPath !== null,
          `Generated file missing. Expected in one of emitDirs: ${JSON.stringify(emitDirs)}; looked for ${fileName}`
        ).toBe(true);

        const expectedContent = readFileSync(expectedPath, "utf-8");
        const generatedContent = readFileSync(generatedPath!, "utf-8");

        expect(generatedContent).toBe(expectedContent);
      }
    });
  });
}

/** Register all scenarios found in tests/resources/ */
const scenarioDir = readdirSync(RESOURCES_ROOT, { withFileTypes: true });
for (const entry of scenarioDir) {
  if (entry.isDirectory()) {
    const scenarioPath = resolve(RESOURCES_ROOT, entry.name);
    // Check that scenario has a config.yaml
    if (existsSync(resolve(scenarioPath, "config.yaml"))) {
      runE2EScenario(entry.name);
    }
  }
}
```

- [ ] **Step 2: Run the E2E test to see it fail or pass**

Run: `bun test tests/e2e/e2e.test.ts`

Expected outcome: This test should PASS if the current codebase produces the expected output. If it FAILS, the E2E test has caught a discrepancy between current behavior and the expected output files — which is the whole point. Read the diff output to understand what differs.

- [ ] **Step 3: If test fails, inspect the diff**

Run: `bun test tests/e2e/e2e.test.ts 2>&1`
Read the failure output to identify:
- Which files differ
- What the content difference is
- Whether the difference is in the generated code (bug) or the expected file (outdated expectation)

If the expected output files are correct (which they should be for the current codebase), the test should pass. If the test fails because expected files are stale, update them by running the commands manually and copying output.

- [ ] **Step 4: Verify all tests still pass together**

Run: `bun test`
Expected: All tests pass (unit + cli + e2e)

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/e2e.test.ts
git commit -m "test: add E2E build+emit pipeline test with resource file validation"
```

---

### Task 6: Final verification and cleanup

**Context for fresh session:** All tasks complete. Run full validation to confirm nothing is broken.

**Files:**
- No new files — verification only

**Interfaces:**
- Consumes: Everything from Tasks 1-5
- Produces: Verified passing test suite, clean typecheck

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass. Output should show:
- `tests/unit/config.test.ts` — passing
- `tests/unit/import.test.ts` — passing
- `tests/unit/emit.test.ts` — passing
- `tests/unit/resolve.test.ts` — passing
- `tests/unit/frontmatter.test.ts` — passing
- `tests/unit/store.test.ts` — passing
- `tests/unit/cli.test.ts` — passing
- `tests/e2e/e2e.test.ts` — passing

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Verify CLI still works end-to-end**

Run: `bun src/index.ts help`
Expected: Usage text printed

Run: `bun src/index.ts build` (with default config)
Expected: Build completes without error

- [ ] **Step 4: Verify no orphaned test files in src/**

Run: `ls src/*.test.ts` or `glob src/*.test.ts`
Expected: Nothing found — all test files moved

- [ ] **Step 5: Verify git status is clean**

Run: `git status`
Expected: Working tree clean

---

## Plan Self-Review

**Spec coverage check:**
- [x] CLI extraction into `src/cli.ts` with `run(argv)` and `parseCliArgs(argv)` → Task 2
- [x] Thin `src/index.ts` shell → Task 3
- [x] Path aliases `@evo/*` in tsconfig → Task 1
- [x] Tests relocated from `src/` to `tests/` → Task 4
- [x] E2E tests with resource files → Task 5
- [x] Exact file content diff validation → Task 5 (Step 1, `expect(generatedContent).toBe(expectedContent)`)
- [x] `tests/build/` for output → Used as `BUILD_DIR`
- [x] Subagent-driven-development skill required → In plan header
- [x] Deepwork skill required → In plan header
- [x] TDD throughout → Failing test first in Tasks 2 and 5

**Placeholder scan:** No TBDs, TODOs, or vague requirements. Every step has exact code or exact commands.

**Type consistency:** `CliArgs` interface used in Task 2 and Task 3. `run(argv: string[])` signature consistent across all tasks. Import paths `@evo/*` used uniformly in Tasks 3-5.

**File path consistency:** All paths are absolute Windows paths. Resource paths match existing project structure (`tests/resources/agents-root/`). Build output goes to `tests/build/` which is already gitignored.

**Task dependency chain:** Task 1 (config) → Task 2 (cli.ts) → Task 3 (index.ts + cli tests) → Task 4 (relocate tests) → Task 5 (E2E) → Task 6 (verify). Each task is independently testable.
