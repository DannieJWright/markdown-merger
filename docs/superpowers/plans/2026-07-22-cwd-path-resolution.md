# CWD Path Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change config path resolution from config-directory-relative to CWD-relative, keeping absolute paths working unchanged.

**Architecture:** Replace `getConfigDir()` with `process.cwd()` in `loadConfig()`. Remove the unused `getConfigDir()` export. Update `.evo/config.yaml` paths to use `../` prefix so data directories under `.evo/agents-root/` continue working from project CWD.

**Tech Stack:** Bun runtime, TypeScript, `node:path` utilities, Bun test framework

## Context for Fresh Agent

**What is this project?** `evo-ai` is a Bun/TypeScript CLI (`evo`) that imports OpenCode agent markdown files, resolves inheritance chains between them, and emits fully merged output files. Think of it as a prompt composition tool.

**Key files you'll touch:**
- `src/config.ts` — Config loader. Reads `.evo/config.yaml`, parses YAML (custom parser, no external deps), merges with `DEFAULT_CONFIG`, resolves relative paths. Currently resolves paths against the config file's directory via `getConfigDir()`. **This is what we're changing.**
- `src/types.ts` — TypeScript interfaces and `DEFAULT_CONFIG` defaults. Has `Config` interface with `storeFile`, `emitDir`, `rootDirs` string fields.
- `src/config.test.ts` — Tests for config loading. Currently has assertions that check paths contain `.evo` — these will break after our change.
- `src/index.ts` — CLI entry point, imports from `config.ts` but only uses `loadConfig()` and `getConfigPath()`. **Does NOT import `getConfigDir()` so no changes needed here.**
- `.evo/config.yaml` — Live config file. Contains `storeFile`, `emitDir`, `rootDirs` paths that are currently relative to `.evo/`.
- `.gitignore` — Currently ignores both `.evo/` and `agents-root/` at project root.

**Other test files (won't be modified):**
- `src/store.test.ts`, `src/import.test.ts`, `src/emit.test.ts`, `src/resolve.test.ts` — All use `tmpdir()` isolation with explicit absolute paths. None call `loadConfig()` or import `getConfigDir()`. They will not be affected.
- `src/frontmatter.test.ts` — Pure unit tests, no filesystem.

**Current directory structure:**
```
.evo/
  config.yaml              ← Config file we'll update
  agents-root/             ← Sample data lives HERE (not being moved)
    input/                 ← Agent .md files
    output/                ← Emitted .md files
    prompts.jsonl          ← JSONL store
agents-root/               ← Stale sample data at project root (will be DELETED)
  input/
src/
  config.ts                ← Main file we're changing
  types.ts                 ← Defaults we're changing
  config.test.ts           ← Tests we're changing
```

**Key concept — `path.join()` behavior:** On Windows, `path.join("/cwd", "absolute/path")` returns `"absolute\\path"`. When the right operand is an absolute path, `path.join()` ignores the left operand. This means absolute paths in the config file will pass through unchanged — no special handling needed.

## Global Constraints

- Bun runtime with native TypeScript execution
- `node:path.join()` handles absolute path passthrough
- Config file format: custom YAML parser (no external deps)
- Tests use `bun:test` framework with `describe`/`test`/`expect`
- All tests use real filesystem with `tmpdir()` isolation
- Commit after each task
- The branch name is `config-refactor`

---

### Task 1: Add failing test for CWD-relative path resolution

**Files:**
- Create: No new test file needed — will update existing `src/config.test.ts` directly

**Purpose:** Add test cases that verify paths resolve against CWD before making the change, so we have evidence the change works.

- [ ] **Step 1: Add CWD-relative test cases to existing config.test.ts**

Update imports in `src/config.test.ts` first — the new tests need `tmpdir`, `join`, `mkdirSync`, `writeFileSync`, and `rmSync`:
```typescript
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
```

Then add the new tests to `src/config.test.ts`:

```typescript
describe("loadConfig CWD path resolution", () => {
  test("resolves relative paths against process.cwd()", async () => {
    const config = await loadConfig();
    // storeFile should be an absolute path under cwd
    expect(config.storeFile).toMatch(process.cwd());
    // emitDir should be an absolute path under cwd
    expect(config.emitDir).toMatch(process.cwd());
    // rootDirs should contain absolute paths under cwd
    for (const dir of config.rootDirs) {
      expect(dir).toMatch(process.cwd());
    }
  });

  test("passes absolute paths through unchanged", async () => {
    const tmpDir = join(tmpdir(), "evo-abs-test-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDir, "abs.yaml");
    const storeAbs = join(tmpDir, "abs-store.jsonl");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(cfgPath, `project: test\nversion: "1"\nstoreFile: ${storeAbs}\nemitDir: ${tmpDir}\nrootDirs:\n  - ${tmpDir}`);

    const origEnv = process.env.EVO_CONFIG;
    try {
      process.env.EVO_CONFIG = cfgPath;
      const config = await loadConfig();
      expect(config.storeFile).toBe(storeAbs);
    } finally {
      if (origEnv === undefined) delete process.env.EVO_CONFIG;
      else process.env.EVO_CONFIG = origEnv;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify current state**

Run:
```bash
bun test src/config.test.ts
```

Expected: Tests FAIL because paths resolve relative to `.evo/` (a relative path from dirname), not process.cwd() (an absolute path). These are the failing tests that the implementation will fix.

- [ ] **Step 3: Commit**

```bash
git add src/config.test.ts
git commit -m "test: add CWD-relative path resolution tests"
```

---

### Task 2: Update config path resolution to use process.cwd()

**Files:**
- Modify: `src/config.ts` (remove `getConfigDir()`, update `loadConfig()`)

**Interfaces:**
- Consumes: `process.cwd()` (built-in)
- Produces: `loadConfig()` resolves paths against CWD instead of config directory

- [ ] **Step 3a: Update DEFAULT_CONFIG rootDirs default in types.ts**

The default `rootDirs` is currently `["agents-root"]` which will resolve to `cwd/agents-root/` after the CWD change — but that directory will be deleted. Update it to match the new config paths.

In `src/types.ts`, replace the DEFAULT_CONFIG block:
```typescript
export const DEFAULT_CONFIG: Omit<Config, "project" | "version"> = {
  maxInheritDepth: DEFAULT_MAX_INHERIT_DEPTH,
  storeFile: "prompts.jsonl",
  emitDir: "output-agents",
  rootDirs: [".evo/agents-root/input"],
};
```

 - [ ] **Step 3b: Update old loadConfig assertions in config.test.ts**

Replace the entire existing `describe("loadConfig")` block. The old assertions `toContain("agents-root\\output")` and the `.toContain(".evo")` loop test implementation details that changed.

Replace with:
```typescript
describe("loadConfig", () => {
  test("merges with defaults for missing keys", async () => {
    const config = await loadConfig();
    expect(config.maxInheritDepth).toBe(5);
    expect(config.storeFile).toContain("prompts.jsonl");
    expect(config.rootDirs.length).toBeGreaterThan(0);
  });

  test("reads project name from config", async () => {
    const config = await loadConfig();
    expect(config.project).toBe("evo-ai");
  });
});
```

Also remove unused `mock` from the imports on line 1:
```typescript
import { describe, test, expect } from "bun:test";
```

 - [ ] **Step 4: Remove unused getConfigDir() and update loadConfig path resolution**

In `src/config.ts`:

Remove lines 11-13 (the `getConfigDir` function):
```typescript
export function getConfigDir(): string {
  return dirname(getConfigPath());
}
```

Remove `dirname` from the import on line 1:
```typescript
import { join } from "node:path";
```

Update lines 106-109 (path resolution in `loadConfig()`) — replace `getConfigDir()` calls with `process.cwd()`:
```typescript
  // Resolve relative paths against current working directory
  config.storeFile = join(process.cwd(), config.storeFile);
  config.emitDir = join(process.cwd(), config.emitDir);
  config.rootDirs = config.rootDirs.map(d => join(process.cwd(), d));
```

- [ ] **Step 5: Verify no broken imports**

The original plan doc (`2026-07-21-agent-inheritance-cli.md`) references `getConfigDir` at several lines but these are documentation references, not runtime imports. Check the actual runtime imports:

Run:
```bash
bun run typecheck
```

Expected: No errors. If there are import errors, fix them.

- [ ] **Step 6: Run config tests**

Run:
```bash
bun test src/config.test.ts
```

Expected: All tests pass. Paths now resolve against CWD instead of config directory.

- [ ] **Step 7: Run all tests**

Run:
```bash
bun test src/
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/config.ts src/types.ts src/config.test.ts
git commit -m "refactor(config): resolve paths relative to CWD instead of config directory"
```

---

### Task 3: Update .evo/config.yaml paths

**Files:**
- Modify: `.evo/config.yaml`

**Purpose:** Since data lives under `.evo/agents-root/` and paths now resolve relative to project CWD (not config directory), update each data path from `agents-root/...` to `.evo/agents-root/...`.

- [ ] **Step 9: Update .evo/config.yaml**

Replace `.evo/config.yaml` contents with:

```yaml
project: evo-ai
version: "1"
maxInheritDepth: 5
storeFile: .evo/agents-root/prompts.jsonl
emitDir: .evo/agents-root/output
rootDirs:
  - .evo/agents-root/input
```

- [ ] **Step 10: Verify paths resolve correctly from project root**

Run from the project root:
```bash
bun run -e "import { loadConfig } from './src/config.ts'; const c = await loadConfig(); console.log('storeFile:', c.storeFile); console.log('emitDir:', c.emitDir); console.log('rootDirs:', c.rootDirs);"
```

Expected: All paths resolve under `.evo/agents-root/` relative to the project root.

- [ ] **Step 11: Commit**

```bash
git add .evo/config.yaml
git commit -m "config: update paths to be CWD-relative with .evo/ prefix"
```

---

### Task 4: Remove agents-root from project root and clean gitignore

**Files:**
- Delete: `agents-root/` directory at project root (sample data)
- Modify: `.gitignore` (remove `agents-root/` entry)

**Purpose:** Consolidate all sample data under `.evo/`. The project root `agents-root/` is stale sample data that should not persist.

- [ ] **Step 12a: Verify data exists under .evo/ before deleting project root agents-root/**

Before deleting, verify that `.evo/agents-root/input/` contains the agent markdown files:
```bash
ls .evo/agents-root/input/
```

If files are missing, this is a data loss risk — stop and investigate before proceeding.

 - [ ] **Step 12: Remove project root agents-root directory**

Run from project root:
```bash
rm -rf agents-root/
```

- [ ] **Step 13: Remove agents-root from .gitignore**

Remove `agents-root/` from `.gitignore` (line 14). The gitignore should read:

```
# Local RAG
models/

# Deepwork state
.slim/deepwork/
.superpowers/

# Project files
node_modules/
dist/

# Generated files
.evo/
```

- [ ] **Step 14: Verify git status**

Run:
```bash
git status
```

Expected: `agents-root/` shows as deleted.

- [ ] **Step 15: Commit**

```bash
git add agents-root/ .gitignore
git commit -m "chore: remove sample agents-root from project root, consolidate under .evo/"
```

---

### Task 5: Final verification

- [ ] **Step 16: Run all tests**

Run:
```bash
bun test src/
```

Expected: All tests pass.

- [ ] **Step 17: Run end-to-end with live config**

Run from project root:
```bash
evo build
evo emit
```

Expected: Commands complete using the updated config paths.

- [ ] **Step 18: Commit if any last-minute fixes are needed**

---
