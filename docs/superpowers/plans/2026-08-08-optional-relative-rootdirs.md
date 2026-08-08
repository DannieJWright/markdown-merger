# Optional Relative `rootDirs` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip missing project-local relative roots with a stderr warning while retaining failures for missing absolute roots.

**Architecture:** Preserve declaration provenance in a `RootDir` value produced by `loadConfig`. `build()` accepts this value plus string roots, normalizes them at its boundary, and skips only explicitly optional missing roots before scanning.

**Tech Stack:** Bun, TypeScript strict ESNext, Bun test, Node filesystem APIs.

## Global Constraints

- Resolve relative roots from `process.cwd()`.
- Missing relative roots warn to stderr and are skipped.
- Missing absolute roots fail without replacing the store.
- Do not alter root order, overrides, aliases, inheritance, module naming, emission, or `BuildResult`.
- Use TDD and `subagent-driven-development`; do not use `deepwork`.

---

## File structure

- `packages/cli/src/types.ts` — root path plus optionality representation and default resolved root.
- `packages/cli/src/config.ts` — resolution that preserves source origin.
- `packages/cli/src/import.ts` — optional-root existence handling.
- `packages/cli/tests/unit/config.test.ts` — provenance and CWD tests.
- `packages/cli/tests/unit/import.test.ts` — skip/warn and required-root safety tests.
- `README.md` — global config contract.

### Task 1: Preserve relative-root provenance

**Files:**
- Modify: `packages/cli/src/types.ts:22-44`
- Modify: `packages/cli/src/config.ts:119-142`
- Test: `packages/cli/tests/unit/config.test.ts:202-234`

**Interfaces:**
- Produces `RootDir { path: string; optional: boolean }`.
- Changes `Config.rootDirs` to `RootDir[]`.
- Tests must not read the caller's `MD_MERGER_CONFIG`; preserve it before the suite, delete it before each test, and restore it after the suite.

- [ ] **Step 1: Write failing resolution tests**

At file scope, capture the initial `MD_MERGER_CONFIG`, then add `beforeEach`/`afterAll` hooks that delete it for every test and restore the captured value after all tests. Import the hooks from `bun:test`. This makes default-config tests reproducible while existing tests can explicitly set and restore their fixture config paths.

Change current root assertions to expect `[{ path: join(process.cwd(), ".md-merger", "agents-root", "input"), optional: true }]` and, for an absolute root, `[{ path: tmpDir, optional: false }]`.

Add a fixture config containing an absolute root plus `.md-merger/inputs/agents`; change CWD to a fixture workspace and assert `[{ path: join(tmpDir, "global"), optional: false }, { path: join(workspace, ".md-merger", "inputs", "agents"), optional: true }]`.

- [ ] **Step 2: Confirm the tests fail**

Run: `bun test --cwd packages/cli tests/unit/config.test.ts`

Expected: FAIL because roots are currently strings.

- [ ] **Step 3: Implement the minimal representation**

Add before `Config` in `packages/cli/src/types.ts`:

```ts
export interface RootDir {
  path: string;
  optional: boolean;
}
```

Set `Config.rootDirs` to `RootDir[]` and change `DEFAULT_CONFIG.rootDirs` to `[{ path: ".md-merger/agents-root/input", optional: true }]`. In `loadConfig()`, use parsed source roots only when present; otherwise clone the default root objects. Map parsed source roots as:

```ts
config.rootDirs = rootDirSources.map((rootDir) => ({
  path: isAbsolute(rootDir) ? rootDir : join(process.cwd(), rootDir),
  optional: !isAbsolute(rootDir),
}));
```

For the no-config branch, resolve the cloned default objects' `.path` values against CWD while retaining `optional: true`; do not cast `DEFAULT_CONFIG` to hide a `string[]`/`RootDir[]` mismatch.

- [ ] **Step 4: Confirm focused tests pass**

Run: `bun test --cwd packages/cli tests/unit/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add packages/cli/src/types.ts packages/cli/src/config.ts packages/cli/tests/unit/config.test.ts && git commit -m "feat: preserve root directory optionality"`

### Task 2: Skip missing optional roots

**Files:**
- Modify: `packages/cli/src/import.ts:1-133`
- Test: `packages/cli/tests/unit/import.test.ts:1-193`

**Interfaces:**
- Changes `build()` root input to `ReadonlyArray<string | RootDir>`.
- Existing string roots normalize to required roots, preserving plugin-default behavior.

- [ ] **Step 1: Write failing build tests**

Import `spyOn`. Add a test that writes `global.md` to `rootDir`, calls `build([{ path: rootDir, optional: false }, { path: join(testDir, ".md-merger", "inputs", "agents"), optional: true }], storePath, "test-project")`, and asserts the global record exists plus a `console.error` call containing `Skipping missing optional root directory`.

Add a test that writes sentinel store bytes, calls `build([{ path: join(testDir, "missing-required-root"), optional: false }], storePath, "test-project")`, asserts error text `existing store was not updated`, and checks sentinel bytes are unchanged.

- [ ] **Step 2: Confirm the tests fail**

Run: `bun test --cwd packages/cli tests/unit/import.test.ts`

Expected: FAIL because `build()` accepts `string[]` only.

- [ ] **Step 3: Implement boundary normalization and skipping**

Import `existsSync` from `node:fs` and `RootDir` from `./types`. Add:

```ts
type BuildRootDir = string | RootDir;

function normalizeRootDir(rootDir: BuildRootDir): RootDir {
  return typeof rootDir === "string" ? { path: rootDir, optional: false } : rootDir;
}
```

Change `build` to take `ReadonlyArray<BuildRootDir>`. Use this scan loop:

```ts
for (const root of rootDirs.map(normalizeRootDir)) {
  if (!existsSync(root.path) && root.optional) {
    console.error(`[md-merger] Skipping missing optional root directory: ${root.path}`);
    continue;
  }
  const files = await globMd(root.path);
  scans.push({ rootDir: root.path, files, moduleNames: new Set(files.map((file) => moduleName(root.path, file))) });
}
```

Leave required paths to the existing `globMd()` failure/wrapper path.

- [ ] **Step 4: Confirm focused tests pass**

Run: `bun test --cwd packages/cli tests/unit/import.test.ts`

Expected: PASS, including the existing string missing-root safety test.

- [ ] **Step 5: Commit**

Run: `git add packages/cli/src/import.ts packages/cli/tests/unit/import.test.ts && git commit -m "feat: skip missing optional root directories"`

### Task 3: Validate consumers and document behavior

**Files:**
- Modify: `packages/opencode-plugin/src/index.ts:27-35` only if typecheck requires it.
- Modify: `README.md:209-212`.

**Interfaces:**
- Plugin default roots remain strings and required.
- CLI call `build(config.rootDirs, ...)` remains valid.

- [ ] **Step 1: Run typecheck to find integration adjustments**

Run: `bun run typecheck`

Expected: either PASS or a plugin error at the spread of default string roots and `RootDir[]`.

- [ ] **Step 2: Fix only demonstrated plugin typing issue**

Retain `const rootDirs = [...await discoverDefaultRoots(defaultsDir), ...config.rootDirs];` if accepted. If annotation is required, use `Array<string | { path: string; optional: boolean }>` without changing root order or runtime behavior.

- [ ] **Step 3: Document the rule**

After the schema `rootDirs` example, add: `rootDirs are resolved from the process working directory. Relative entries are optional: if absent, md-merger writes a warning to stderr and continues. Absolute entries are required and a missing directory fails the build. This permits a global MD_MERGER_CONFIG to combine required shared imports with project-local imports.`

- [ ] **Step 4: Run validation**

Run: `bun test --cwd packages/cli && bun test --cwd packages/opencode-plugin && bun run typecheck`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

Run: `git add README.md packages/opencode-plugin/src/index.ts packages/cli/src/cli.ts && git commit -m "docs: explain optional relative root dirs"`

## Plan self-review

- Task 1 preserves declaration origin and CWD resolution.
- Task 2 implements skip/warning while retaining required-root store safety.
- Task 3 confirms the plugin boundary and documents global-config usage.
- No placeholder steps remain, and the defined `RootDir` interface is consistent across all tasks.
