# Alias and Snapshot Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppress canonical OpenCode keys for every exported module, replace stale append-only stores with transactional source snapshots, and remove only obsolete files previously managed by md-merger.

**Architecture:** `build()` will collect both the final later-root-wins alias map and every canonical export target, then prepare a complete store in a same-directory temporary file and atomically replace the live store only after success. The plugin will use the final map for alias ownership and all export targets for canonical-key suppression. Emission will reconcile a versioned managed-output manifest beside the store, retaining unknown files and failed current artifacts while deleting obsolete managed files.

**Tech Stack:** Bun, strict TypeScript, `bun:test`, Node filesystem/path APIs, `@md-merger/cli`, `@md-merger/opencode-plugin`.

## Global Constraints

- Follow TDD for every behavior change: observe the focused test fail before changing production code.
- Do not change root-export manifest grammar or validation.
- Do not change `extends` normalization, canonical inheritance resolution, merging, abstract filtering, or type routing.
- Do not clear entire output directories or remove files not recorded as managed by md-merger.
- Do not add configuration or runtime dependencies.
- A failed build must preserve the prior store, clean temporary files, and report that the store was not updated.
- Dry-run emission must not alter outputs, manifests, or temporary files.
- Do not stage, modify, or remove unrelated worktree files such as `prompts.jsonl`, `NUL`, or pre-existing spec edits.

## Required Skills

> **Required Skills**
>
> The agent executing this plan **MUST** invoke the `subagent-driven-development` skill for implementation execution.
>
> For large, high-risk, or multi-phase efforts, the agent **MUST** also invoke the `deepwork` skill.
>
> Do **NOT** read the content of these skills — just invoke them and follow their defined workflow. The skill descriptions in the system prompt tell you when each applies.

> **⚠️ BEFORE IMPLEMENTATION:** You must invoke the `subagent-driven-development` skill (and `deepwork` if this is a large effort). This is not optional. Do not skip this step.

## Fresh-Session Context

- Approved spec: `docs/superpowers/specs/2026-08-08-alias-and-snapshot-remediation-design.md`.
- `packages/cli/src/root-exports.ts` parses one root's restricted `md-merger-root.yaml` and returns `Map<alias, canonicalTarget>`.
- `packages/cli/src/import.ts` scans roots, merges aliases in root order, and currently appends/upserts records directly into the live store. Its `BuildResult` currently exposes only the final alias map.
- `packages/cli/src/store.ts` provides append-oriented JSONL helpers. Snapshot replacement belongs here as a focused filesystem primitive; source discovery and record construction remain in `import.ts`.
- `packages/cli/src/emit.ts` emits all latest concrete records to canonical paths and currently has no generated-file ownership manifest or stale-file cleanup.
- `packages/opencode-plugin/src/index.ts` reverses the final alias map, reads emitted agent files, and mutates OpenCode's `agent` map. It currently treats a superseded export target as unexported and can inject its canonical path.
- `packages/cli/tests/unit/import.test.ts`, `packages/cli/tests/unit/store.test.ts`, `packages/cli/tests/unit/emit.test.ts`, and `packages/opencode-plugin/tests/plugin.test.ts` are the focused test locations.
- Runtime defaults are copied from `packages/cli/defaults/` into the plugin package for publication; plugin roots are ordered defaults first and project roots second.
- Environment requires Bun with existing workspace dependencies. Tests must use unique temporary directories and restore `MD_MERGER_CONFIG` and `process.cwd()` in cleanup paths.

## File Structure

- Modify `packages/cli/src/import.ts`: collect `exportedModules`, build against a temporary snapshot store, and wrap preparation/replacement failures contextually.
- Modify `packages/cli/src/store.ts`: add complete-record writing and atomic same-directory replacement with guaranteed temporary cleanup.
- Modify `packages/cli/src/api.ts`: export any new public metadata/types required by the plugin.
- Modify `packages/cli/src/emit.ts`: own managed-output manifest parsing, stale-path safety validation, reconciliation, and transactional manifest writes.
- Modify `packages/opencode-plugin/src/index.ts`: suppress canonical injection for all exported targets while mapping final aliases normally.
- Modify focused tests under `packages/cli/tests/unit/` and `packages/opencode-plugin/tests/plugin.test.ts`.
- Modify `README.md`: document snapshot-store and managed-output semantics.

---

### Task 1: Suppress all exported canonical agent keys

**Files:**
- Modify: `packages/cli/src/import.ts`
- Modify: `packages/cli/src/api.ts`
- Modify: `packages/opencode-plugin/src/index.ts`
- Test: `packages/cli/tests/unit/import.test.ts`
- Test: `packages/opencode-plugin/tests/plugin.test.ts`

**Interfaces:**
- Produces: `BuildResult { exports: Map<string, string>; exportedModules: Set<string> }`.
- `exports` contains only final later-root-wins aliases.
- `exportedModules` contains targets from every root manifest before alias replacement.
- Plugin consumes both collections; only final alias targets receive alias keys, and no member of `exportedModules` receives a canonical fallback key.

- [ ] **Step 1: Add failing CLI metadata coverage**

Extend the existing later-root export test with two roots that both publish `plan-o-strator` and assert:

```ts
const result = await build([rootA, rootB], storePath, "test-project");
expect(result.exports).toEqual(new Map([
  ["plan-o-strator", "base/plan-o-strator"],
]));
expect(result.exportedModules).toEqual(new Set([
  "base/core/plan-o-strator",
  "base/plan-o-strator",
]));
```

- [ ] **Step 2: Add the exact failing plugin reproduction**

Create a serial temporary fixture where defaults export `plan-o-strator: base/core/plan-o-strator.md` and the project exports `plan-o-strator: base/plan-o-strator.md`. Both targets are concrete agents with distinguishable prompt bodies. After applying the returned config hook, assert:

```ts
const agents = opencodeConfig.agent as Record<string, { prompt: string }>;
expect(Object.keys(agents).filter((key) => key.includes("plan-o-strator")).sort())
  .toEqual(["plan-o-strator"]);
expect(agents["plan-o-strator"]?.prompt).toContain("Project plan-o-strator.");
expect(agents["plan-o-strator"]?.prompt).not.toContain("Default plan-o-strator.");
expect(agents["base/core/plan-o-strator"]).toBeUndefined();
expect(agents["base/plan-o-strator"]).toBeUndefined();
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
bun test --cwd packages/cli tests/unit/import.test.ts
bun test --cwd packages/opencode-plugin tests/plugin.test.ts
```

Expected: CLI compilation/assertion fails because `exportedModules` is absent; plugin test exposes the superseded default target canonically.

- [ ] **Step 4: Collect all export targets without changing alias resolution**

In `packages/cli/src/import.ts`, extend the result and manifest loop:

```ts
export interface BuildResult {
  exports: Map<string, string>;
  exportedModules: Set<string>;
}

const exports = new Map<string, string>();
const exportedModules = new Set<string>();
for (const scan of scans) {
  const rootExports = await loadRootExports(scan.rootDir, scan.moduleNames);
  for (const [alias, target] of rootExports) {
    exportedModules.add(target);
    exports.set(alias, target);
  }
}

return { exports, exportedModules };
```

Keep bare `extends` resolution bound to `exports`, not `exportedModules`.

- [ ] **Step 5: Suppress canonical fallback keys for every export target**

In `packages/opencode-plugin/src/index.ts`, destructure both collections and change fallback collection only:

```ts
const { exports, exportedModules } = await build(rootDirs, config.storeFile, config.project);
```

```ts
const aliases = aliasesByModule.get(key);
if (aliases) {
  for (const alias of aliases) exportedPrompts.set(alias, prompt);
} else if (!exportedModules.has(key) && !exports.has(key)) {
  fallbackPrompts.set(key, prompt);
}
```

Retain the existing alias-over-canonical collision precedence by applying fallback prompts first and exported prompts last.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the two Step 3 commands. Expected: all focused tests pass, and canonical inheritance assertions remain unchanged.

- [ ] **Step 7: Commit Task 1**

```bash
git add packages/cli/src/import.ts packages/cli/src/api.ts packages/cli/tests/unit/import.test.ts packages/opencode-plugin/src/index.ts packages/opencode-plugin/tests/plugin.test.ts
git commit -m "fix(plugin): suppress superseded export targets"
```

### Task 2: Replace stores with transactional source snapshots

**Files:**
- Modify: `packages/cli/src/store.ts`
- Modify: `packages/cli/src/import.ts`
- Test: `packages/cli/tests/unit/store.test.ts`
- Test: `packages/cli/tests/unit/import.test.ts`

**Interfaces:**
- Produces: `replaceStoreSnapshot(storePath: string, records: PromptRecord[]): Promise<void>`.
- Temporary path is unique, in `dirname(storePath)`, and recognizable in tests with prefix `.${basename(storePath)}.` and suffix `.tmp`.
- The live store is replaced only after all records are prepared successfully.
- Build preparation and replacement errors have distinct messages and preserve the original error as `cause`.

- [ ] **Step 1: Add failing store replacement tests**

In `store.test.ts`, test a successful replacement and injected write/rename failures. If direct spying on `node:fs/promises` is unreliable in Bun, define an internal exported-for-test `StoreFileOps` interface and optional second argument rather than globally monkey-patching:

```ts
export interface StoreFileOps {
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
  rename: typeof rename;
  rm: typeof rm;
}
```

Required assertions:

```ts
await replaceStoreSnapshot(testStore, [makeRecord("current")]);
expect((await readStore(testStore)).map((record) => record.name)).toEqual(["current"]);
expect(readdirSync(testDir).some((name) => name.endsWith(".tmp"))).toBe(false);
```

For write and rename failures, prepopulate `testStore` with `original`, reject the selected operation, then assert the original remains and no `.tmp` file remains.

- [ ] **Step 2: Add failing build snapshot tests**

Add tests proving:

```ts
await build([rootDir], storePath, "test-project");
rmSync(join(rootDir, "old.md"));
writeFileSync(join(rootDir, "new.md"), "---\ntype: agent\n---\n## Role\nNew.");
await build([rootDir], storePath, "test-project");
expect((await readStore(storePath)).map((record) => record.name)).toEqual(["new"]);
```

Also prepopulate a sentinel store, introduce an invalid manifest or missing root, and assert rejection contains `existing store was not updated`, the sentinel bytes are unchanged, and no temporary files remain.

Retain the existing test that a present module preserves prior `type` when its current frontmatter omits it.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
bun test --cwd packages/cli tests/unit/store.test.ts tests/unit/import.test.ts
```

Expected: replacement helper is absent and moved/deleted modules remain in the append-only store.

- [ ] **Step 4: Implement atomic store snapshot replacement**

In `store.ts`, add imports for `basename`, `dirname`, `join` and promise APIs `mkdir`, `rename`, `rm`, `writeFile`. Implement:

```ts
export async function replaceStoreSnapshot(
  storePath: string,
  records: PromptRecord[],
  fileOps: StoreFileOps = defaultStoreFileOps,
): Promise<void> {
  const directory = dirname(storePath);
  const tempPath = join(directory, `.${basename(storePath)}.${crypto.randomUUID()}.tmp`);
  await fileOps.mkdir(directory, { recursive: true });
  try {
    const text = records.map((record) => JSON.stringify(record)).join("\n");
    await fileOps.writeFile(tempPath, text ? `${text}\n` : "", "utf-8");
    await fileOps.rename(tempPath, storePath);
  } finally {
    await fileOps.rm(tempPath, { force: true }).catch(() => undefined);
  }
}
```

The test seam is for deterministic failure evidence only; production callers omit `fileOps`.

- [ ] **Step 5: Prepare records entirely before replacing the live store**

In `import.ts`:

1. Read and deduplicate prior latest records before preparation.
2. Use a unique temporary preparation store, or construct records in memory with a small pure `createSnapshotRecord(previous, patch, project)` helper.
3. Preserve prior `id`, `createdAt`, and prior `type` for still-present modules; increment version for still-present modules and start new modules at version 1.
4. Apply later-root same-module replacement within the new snapshot so only one latest record per canonical name is written.
5. Call `replaceStoreSnapshot()` exactly once after all roots and modules parse successfully.

Wrap errors by phase:

```ts
throw new Error(
  `Build failed; existing store was not updated: ${message}`,
  { cause: error },
);
```

```ts
throw new Error(
  `Build snapshot was prepared, but store replacement failed; existing store was not updated: ${message}`,
  { cause: error },
);
```

Use `finally` for every preparation temporary path. Do not truncate the live store before successful replacement.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Step 3 command. Expected: snapshot, failure preservation, temp cleanup, contextual messages, type preservation, root ordering, and alias tests pass.

- [ ] **Step 7: Run the complete CLI suite**

Run: `bun test --cwd packages/cli`

Expected: all CLI tests pass. Update tests that intentionally asserted retained historical versions only where snapshot semantics deliberately supersede them; do not weaken inheritance or routing assertions.

- [ ] **Step 8: Commit Task 2**

```bash
git add packages/cli/src/store.ts packages/cli/src/import.ts packages/cli/tests/unit/store.test.ts packages/cli/tests/unit/import.test.ts
git commit -m "fix(cli): build transactional store snapshots"
```

### Task 3: Reconcile managed emitted files safely

**Files:**
- Modify: `packages/cli/src/emit.ts`
- Test: `packages/cli/tests/unit/emit.test.ts`

**Interfaces:**
- Produces: managed manifest path `${storePath}.outputs.json`.
- Manifest schema:

```ts
interface ManagedOutputManifest {
  version: 1;
  roots: string[];
  files: string[];
}
```

- `roots` and `files` are absolute normalized paths. A previous file is eligible for deletion only if it is equal to or below one of the previous manifest's roots using `relative()` plus `isAbsolute()` checks.
- Failed current modules retain matching previously managed paths.

- [ ] **Step 1: Add failing managed-output lifecycle tests**

Add one pipeline test that builds/emits `old.md`, replaces the source with `nested/new.md`, rebuilds/emits, and asserts:

```ts
expect(existsSync(join(outputRoot, "old.md"))).toBe(false);
expect(existsSync(join(outputRoot, "nested", "new.md"))).toBe(true);
expect(existsSync(join(outputRoot, "keep-me.txt"))).toBe(true);
```

Read `${storePath}.outputs.json` and assert it contains only the current managed output and the configured absolute output root.

- [ ] **Step 2: Add failure and dry-run tests**

Add focused tests proving:

- A prior managed file for a still-current module remains when `renderText` fails due to a missing parent or cycle.
- `emitAllWithMetadata(..., true)` leaves output bytes and manifest bytes unchanged and creates no temporary manifest.
- A simulated manifest-write failure reports the manifest path, leaves the previous manifest in place, and removes its `.tmp` file. Use an optional internal `EmitFileOps` test seam if Bun cannot reliably spy on filesystem module functions.
- A crafted prior manifest entry outside every recorded `roots` entry is ignored, never deleted, and omitted from the next trusted manifest.

- [ ] **Step 3: Run focused emit tests and verify RED**

Run:

```bash
bun test --cwd packages/cli tests/unit/emit.test.ts
```

Expected: stale managed files remain and no output manifest exists.

- [ ] **Step 4: Implement versioned managed-manifest helpers**

In `emit.ts`, add small private helpers:

```ts
const MANAGED_OUTPUT_VERSION = 1;

function managedOutputManifestPath(storePath: string): string {
  return `${storePath}.outputs.json`;
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}
```

Parse only `version: 1`, string roots, and string files. Normalize with `resolve()`. Discard previous file entries outside all recorded previous roots.

- [ ] **Step 5: Reconcile only successfully managed or deliberately retained paths**

During emission track:

- `successfulPaths`: files written this run.
- `currentExpectedPaths`: canonical output paths for current concrete routed records.
- `failedCurrentPaths`: expected paths whose render/write failed.

After module processing, when `dryRun === false`:

1. Load and validate the prior manifest.
2. Build `retainedFailedPaths` as prior trusted files also present in `failedCurrentPaths`.
3. Define next managed files as successful paths plus retained failed paths.
4. Remove prior trusted files absent from both current successful and retained sets.
5. If removal fails, throw `Failed to remove stale managed output "<path>": <message>` and do not replace the manifest.
6. Write the next manifest to a same-directory unique temporary path, rename it over the live manifest, and remove the temporary path in `finally`.

Do not remove parent directories; leaving empty directories avoids deleting user-owned directory structure.

- [ ] **Step 6: Run focused emit tests and verify GREEN**

Run the Step 3 command. Expected: lifecycle, unknown-file preservation, failed-current retention, unsafe-entry rejection, dry-run immutability, and temp cleanup pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add packages/cli/src/emit.ts packages/cli/tests/unit/emit.test.ts
git commit -m "fix(cli): remove obsolete managed outputs"
```

### Task 4: Document and verify the complete remediation

**Files:**
- Modify: `README.md`
- Test: repository suites

**Interfaces:**
- Documents snapshot-store replacement, failure preservation, managed-output ownership, and all-export-target canonical suppression.
- Verifies CLI/plugin integration and public TypeScript compatibility.

- [ ] **Step 1: Update public documentation**

In Root Exports, clarify that canonical plugin keys are suppressed for all manifest targets, including targets superseded by later roots. In Store/Emit documentation, add:

```md
Each build transactionally replaces the JSONL store with a snapshot of the current roots. If preparation or replacement fails, the previous store is left unchanged and the failure is reported. Temporary snapshot files are cleaned on both success and failure.

Emit tracks its generated files in `<storeFile>.outputs.json`. A successful non-dry-run emit removes obsolete files listed in that manifest while preserving unknown files and prior files for current modules that fail to render. Dry runs do not change output files or the manifest.
```

- [ ] **Step 2: Run package suites**

Run:

```bash
bun test --cwd packages/cli
bun test --cwd packages/opencode-plugin
```

Expected: both suites pass with zero failures.

- [ ] **Step 3: Run workspace verification**

Run:

```bash
bun test
bun run typecheck
git diff --check
```

Expected: all repository tests pass, TypeScript reports no diagnostics, and Git reports no whitespace errors.

- [ ] **Step 4: Inspect scope and generated artifacts**

Run: `git status --short`

Expected: intended source/test/README changes are committed; no test stores, output manifests, defaults copies, output directories, `dist`, or temporary files are staged. Pre-existing unrelated files remain untouched.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md
git commit -m "docs: describe snapshot build cleanup"
```

## Verification Criteria

- Exact plugin reproduction injects only `plan-o-strator`, backed by the later project export.
- Neither current nor superseded export targets appear under canonical OpenCode keys.
- Successful builds contain exactly one latest record per currently discovered canonical module.
- Failed builds preserve byte-identical prior stores, report the non-update, and leave no temporary files.
- Successful emits remove obsolete managed files but preserve unknown files and failed-current artifacts.
- Managed-manifest failures are reported and clean temporary files.
- Dry runs are filesystem-immutable.
- `bun test` and `bun run typecheck` pass.

## Execution Notes

- Use `subagent-driven-development` task-by-task with a fresh implementation specialist and mandatory independent oracle verification after each implementation task.
- This plan is multi-phase but bounded within one CLI/plugin pipeline. Invoke `deepwork` only if implementation reveals broader architectural dependencies or repeated failed fixes.
- Never substitute truncating the live store before build; transactional replacement is a binding safety requirement.
