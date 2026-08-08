# Root Export Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit, later-root-overrideable bare import aliases through optional per-root `md-merger-root.yaml` manifests while preserving exact path imports.

**Architecture:** Add a dependency-free root-manifest parser and change `build()` into preflight and import phases. Preflight validates every root and composes a final alias map; import canonicalizes `extends` into extensionless exact module paths so resolution, topology, doctor, and emission remain unchanged.

**Tech Stack:** Bun 1.x, strict TypeScript with `noUncheckedIndexedAccess`, `bun:test`, Node filesystem/path APIs, append-only JSONL storage.

## Global Constraints

- Use test-driven development: write each focused failing test, observe the expected failure, implement the minimum behavior, and rerun it.
- Use `superpowers:subagent-driven-development` for current-session implementation; use `superpowers:executing-plans` only when executing this plan in a separate session.
- The `deepwork` skill is not required for the approved bounded design. Stop and invoke it before continuing if work expands into a store migration, runtime alias resolution, or a broader resolver redesign.
- Do not add runtime dependencies; manifest parsing must use Bun/Node APIs and project-owned code.
- Keep `PromptRecord.extends` canonical and extensionless; do not make resolver, topology, doctor, or emit alias-aware.
- Preserve configured root order: later roots replace earlier exports and same-full-path modules.
- A manifest export may target only a Markdown module in the same root.
- Validate all manifests before appending any JSONL record.
- Preserve strict TypeScript and explicitly handle absent map/array values.
- Do not commit generated defaults, stores, emitted output, `dist`, or test build artifacts.

---

## File Map

- Create `packages/cli/src/root-exports.ts`: parse and validate one root's optional export manifest.
- Create `packages/cli/tests/unit/root-exports.test.ts`: focused manifest schema and path validation tests.
- Modify `packages/cli/src/import.ts`: preflight roots, compose aliases, normalize references, and import only after validation.
- Modify `packages/cli/tests/unit/import.test.ts`: build-time normalization, precedence, fallback, and atomicity tests.
- Modify `packages/cli/tests/unit/emit.test.ts`: full CLI pipeline override-chain acceptance test written before build canonicalization.
- Modify `packages/opencode-plugin/tests/plugin.test.ts`: bundled-default/project export integration test.
- Modify `README.md`: public configuration and inheritance semantics.
- Modify `Justfile`: synchronize inheritance examples if they imply that every bare name is globally inferred.

### Task 1: Parse and Validate Root Export Manifests

**Files:**
- Create: `packages/cli/src/root-exports.ts`
- Create: `packages/cli/tests/unit/root-exports.test.ts`

**Interfaces:**
- Consumes: an absolute root directory and the canonical module names discovered under that root.
- Produces:

```ts
export const ROOT_CONFIG_FILENAME = "md-merger-root.yaml";

export async function loadRootExports(
  rootDir: string,
  moduleNames: ReadonlySet<string>,
): Promise<Map<string, string>>;
```

- Missing `md-merger-root.yaml` returns an empty map.
- A present manifest is parsed as exactly one top-level `exports` mapping with entries indented by exactly two spaces.
- Targets are normalized to `/` and have one trailing `.md` removed.
- The supported manifest syntax is blank/full-line comments, CRLF or LF, exactly one unindented `exports:`, and exactly two-space-indented unquoted scalar entries. Empty exports are valid; quoted scalars, inline comments/maps, nested values, and other top-level keys are rejected.

- [ ] **Step 1: Add the missing-file and valid-manifest tests**

Create `packages/cli/tests/unit/root-exports.test.ts` with a unique temporary root per test and cleanup in `afterEach`. Add these first tests:

```ts
test("returns no exports when the optional manifest is absent", async () => {
  expect(await loadRootExports(rootDir, new Set(["base/agent"]))).toEqual(new Map());
});

test("loads aliases and normalizes md suffixes and separators", async () => {
  writeFileSync(join(rootDir, ROOT_CONFIG_FILENAME), [
    "exports:",
    "  orchestrator: base/orchestrator.md",
    "  worker: base\\worker.md",
    "",
  ].join("\n"));

  expect(await loadRootExports(
    rootDir,
    new Set(["base/orchestrator", "base/worker"]),
  )).toEqual(new Map([
    ["orchestrator", "base/orchestrator"],
    ["worker", "base/worker"],
  ]));
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
bun test --cwd packages/cli tests/unit/root-exports.test.ts
```

Expected: FAIL because `@md-merger/root-exports` does not exist.

- [ ] **Step 3: Implement missing-file handling and valid parsing**

In `packages/cli/src/root-exports.ts`, implement a schema-specific line parser rather than reusing `loadConfig()`. Start with these helpers and public shape:

```ts
import { readFile } from "node:fs/promises";
import { join, posix, win32 } from "node:path";

export const ROOT_CONFIG_FILENAME = "md-merger-root.yaml";

function normalizeTarget(target: string): string {
  return target.trim().replace(/\\/g, "/").replace(/\.md$/, "");
}

export async function loadRootExports(
  rootDir: string,
  moduleNames: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const manifestPath = join(rootDir, ROOT_CONFIG_FILENAME);
  let text: string;
  try {
    text = await readFile(manifestPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }

  const exports = new Map<string, string>();
  // Parse the strict schema line-by-line, then validate before returning.
  return exports;
}
```

Complete the minimum parser needed for the two tests: recognize unindented `exports:` and indented `alias: target` entries, preserving entries in the `Map`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: 2 tests pass.

- [ ] **Step 5: Add failing schema and path validation tests**

Add table-driven cases asserting rejection for:

```ts
const invalidManifests = [
  ["missing exports mapping", "name: root\n", "exports"],
  ["exports is scalar", "exports: base/agent\n", "mapping"],
  ["duplicate top-level exports", "exports:\nexports:\n", "duplicate"],
  ["unknown top-level key", "exports:\nname: root\n", "top-level"],
  ["inline top-level exports map", "exports: { base: base/agent }\n", "mapping"],
  ["quoted scalar", "exports:\n  base: 'base/agent'\n", "unquoted"],
  ["inline comment", "exports:\n  base: base/agent # comment\n", "inline"],
  ["inline entry map", "exports:\n  base: { path: base/agent }\n", "inline"],
  ["nested value", "exports:\n  base:\n    path: base/agent\n", "nested"],
  ["empty alias", "exports:\n  : base/agent\n", "alias"],
  ["slash in alias", "exports:\n  base/agent: base/agent\n", "bare"],
  ["backslash in alias", "exports:\n  base\\agent: base/agent\n", "bare"],
  ["duplicate alias", "exports:\n  base: base/one\n  base: base/two\n", "duplicate"],
  ["empty target", "exports:\n  base:\n", "target"],
  ["absolute target", "exports:\n  base: /base/agent.md\n", "relative"],
  ["Windows drive target", "exports:\n  base: C:\\base\\agent.md\n", "relative"],
  ["Windows UNC target", "exports:\n  base: \\\\server\\share\\agent.md\n", "relative"],
  ["dot segment", "exports:\n  base: ./base/agent.md\n", "segment"],
  ["parent traversal", "exports:\n  base: ../base/agent.md\n", "segment"],
  ["quoted alias", "exports:\n  'base': base/agent\n", "unquoted"],
  ["indented exports", "  exports:\n    base: base/agent\n", "top-level"],
  ["unindented entry", "exports:\nbase: base/agent\n", "indent"],
  ["incorrect entry indentation", "exports:\n   base: base/agent\n", "indent"],
  ["non-mapping content", "exports:\n  - base/agent\n", "mapping"],
] as const;
```

Add positive cases proving that `exports:` with no entries returns an empty map, CRLF input is accepted, and blank/full-line comment lines are ignored.

For each case, write the manifest, call `loadRootExports`, and assert rejection with the listed message fragment. Add a separate missing-target test:

```ts
test("rejects an export whose target is not a module in the same root", async () => {
  writeFileSync(join(rootDir, ROOT_CONFIG_FILENAME),
    "exports:\n  base: elsewhere/base.md\n");
  await expect(loadRootExports(rootDir, new Set(["base/agent"])))
    .rejects.toThrow("elsewhere/base");
});
```

- [ ] **Step 6: Run validation tests and verify RED**

Run the focused test file. Expected: the new invalid cases fail because validation is incomplete.

- [ ] **Step 7: Complete strict validation**

Implement validation with these rules:

```ts
function assertBareAlias(alias: string, manifestPath: string): void {
  if (alias.length === 0 || alias.includes("/") || alias.includes("\\")) {
    throw new Error(`Invalid bare export alias "${alias}" in ${manifestPath}`);
  }
}

function assertRelativeTarget(target: string, manifestPath: string): void {
  const normalized = target.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (
    posix.isAbsolute(normalized)
    || win32.isAbsolute(target)
    || segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Export target "${target}" in ${manifestPath} must be a relative module path without dot segments`);
  }
}
```

Reject unknown or repeated top-level content, an absent/scalar `exports`, wrong indentation, unsupported quoted/inline/nested syntax, duplicate aliases before `Map.set`, empty targets, and canonical targets absent from `moduleNames`. Accept an empty mapping, CRLF, blank lines, and full-line comments. Include manifest, alias, or target in each error.

- [ ] **Step 8: Run manifest tests and CLI typecheck**

Run:

```bash
bun test --cwd packages/cli tests/unit/root-exports.test.ts
bun run typecheck
```

Expected: all manifest tests pass and TypeScript reports no errors.

- [ ] **Step 9: Commit the parser task**

```bash
git add packages/cli/src/root-exports.ts packages/cli/tests/unit/root-exports.test.ts
git commit -m "feat: validate root export manifests"
```

### Task 2: Canonicalize Imports During Build Preflight

**Files:**
- Modify: `packages/cli/src/import.ts:1-81`
- Modify: `packages/cli/tests/unit/import.test.ts:1-110`
- Modify: `packages/cli/tests/unit/emit.test.ts:161-372`

**Interfaces:**
- Consumes: `loadRootExports(rootDir, moduleNames)` from Task 1.
- Produces unchanged public signature:

```ts
export async function build(
  rootDirs: string[],
  storePath: string,
  project: string,
): Promise<void>;
```

- Produces internal helpers:

```ts
export function normalizeModuleReference(reference: string): string;
export function resolveModuleReference(
  reference: string,
  exports: ReadonlyMap<string, string>,
): string;
```

- [ ] **Step 1: Add failing reference normalization tests**

Import the two helper functions in `import.test.ts` and add:

```ts
test("normalizes exact references and optional md suffixes", () => {
  expect(normalizeModuleReference(" base\\agent.md ")).toBe("base/agent");
  expect(resolveModuleReference("base/agent.md", new Map([
    ["agent", "user/agent"],
  ]))).toBe("base/agent");
});

test("resolves a bare export and preserves an unexported root-level fallback", () => {
  const exports = new Map([["agent", "user/agent"]]);
  expect(resolveModuleReference("agent", exports)).toBe("user/agent");
  expect(resolveModuleReference("base", exports)).toBe("base");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
bun test --cwd packages/cli tests/unit/import.test.ts
```

Expected: FAIL because the helper exports do not exist.

- [ ] **Step 3: Implement minimal canonical reference helpers**

Add to `import.ts`:

```ts
export function normalizeModuleReference(reference: string): string {
  return reference.trim().replace(/\\/g, "/").replace(/\.md$/, "");
}

export function resolveModuleReference(
  reference: string,
  exports: ReadonlyMap<string, string>,
): string {
  const normalized = normalizeModuleReference(reference);
  if (normalized.includes("/")) return normalized;
  return exports.get(normalized) ?? normalized;
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all existing and new import tests pass.

- [ ] **Step 5: Add failing build preflight and precedence tests**

Add tests that create two independent roots. The first root contains `base/concrete.md` extending `implementation`; its manifest exports `implementation: base/default.md`. The second root contains `user/implementation.md` and exports `implementation: user/implementation.md`. After `build([defaultRoot, userRoot], ...)`, assert:

```ts
expect((await findLatest(storePath, "base/concrete"))?.extends)
  .toEqual(["user/implementation"]);
```

Also add:

```ts
test("normalizes md suffixes in exact extends values during build", async () => {
  // base/child.md extends base/parent.md
  // Assert stored extends equals ["base/parent"].
});

test("does not mutate the store when any root manifest is invalid", async () => {
  writeFileSync(storePath, "sentinel\n");
  // Put a valid module in root A and an invalid missing-target export in root B.
  await expect(build([rootA, rootB], storePath, "test-project")).rejects.toThrow();
  expect(readFileSync(storePath, "utf-8")).toBe("sentinel\n");
});
```

In `emit.test.ts`, add the full override-chain acceptance test before changing `build()`. Create:

```text
defaults/base/base-agent.md
defaults/base/base-orchestrator.md
defaults/base/orchestrator.md
defaults/md-merger-root.yaml
user/user/base-orchestrator.md
user/md-merger-root.yaml
```

Use these exact distinct sections so existing `(name, level)` merge semantics produce the intended result:

```markdown
<!-- defaults/base/base-agent.md -->
---
type: agent
abstract: true
---
## Description
This is the base agent.
```

```markdown
<!-- defaults/base/base-orchestrator.md; extends: [base/base-agent.md] -->
## Description
This is the abstract base orchestrator.

## Role
Orchestrator.
```

```markdown
<!-- user/user/base-orchestrator.md; extends: [base/base-orchestrator.md] -->
## Description
This is the user's abstract base orchestrator.

## Subrole
User Orchestrator.
```

```markdown
<!-- defaults/base/orchestrator.md; extends: [base-orchestrator] -->
## Description
This is the concrete base orchestrator.
```

Default exports map `base-orchestrator` to `base/base-orchestrator.md`; user exports map it to `user/base-orchestrator.md`. Assert only `base/orchestrator.md` is emitted, with concrete Description, default Role, and user Subrole, and without either abstract Description. Also assert the stored canonical chain.

- [ ] **Step 6: Run import and acceptance tests and verify RED**

Run:

```bash
bun test --cwd packages/cli tests/unit/import.test.ts tests/unit/emit.test.ts
```

Expected: precedence, atomicity, and override-chain tests fail because the current build scans and writes each root immediately and does not canonicalize aliases.

- [ ] **Step 7: Refactor build into preflight and import phases**

Represent preflight data explicitly:

```ts
interface RootScan {
  rootDir: string;
  files: string[];
  moduleNames: Set<string>;
}

function moduleName(rootDir: string, filepath: string): string {
  return relative(rootDir, filepath).replace(/\.md$/, "").replace(/\\/g, "/");
}
```

At the start of `build`:

```ts
const scans: RootScan[] = [];
for (const rootDir of rootDirs) {
  const files = await globMd(rootDir);
  scans.push({
    rootDir,
    files,
    moduleNames: new Set(files.map((file) => moduleName(rootDir, file))),
  });
}

const exports = new Map<string, string>();
for (const scan of scans) {
  const rootExports = await loadRootExports(scan.rootDir, scan.moduleNames);
  for (const [alias, target] of rootExports) exports.set(alias, target);
}
```

Only after both loops succeed, run the existing import/write logic over `scans`. Replace raw `extendsArr` with:

```ts
const extendsArr = Array.isArray(metadata.extends)
  ? (metadata.extends as string[]).map((entry) => resolveModuleReference(entry, exports))
  : undefined;
```

Keep root and file processing order unchanged. Do not resolve aliases in downstream modules.

- [ ] **Step 8: Run import and acceptance tests and verify GREEN**

Run:

```bash
bun test --cwd packages/cli tests/unit/import.test.ts
bun test --cwd packages/cli tests/unit/emit.test.ts --test-name-pattern "root export"
```

Expected: all import tests and the full override-chain acceptance test pass, including existing later-root same-path behavior.

- [ ] **Step 9: Run resolver and emit regression tests**

Run:

```bash
bun test --cwd packages/cli tests/unit/resolve.test.ts tests/unit/emit.test.ts
```

Expected: all tests pass without changing `resolve.ts` or graph code.

- [ ] **Step 10: Commit build canonicalization**

```bash
git add packages/cli/src/import.ts packages/cli/tests/unit/import.test.ts packages/cli/tests/unit/emit.test.ts
git commit -m "feat: canonicalize root export aliases during build"
```

### Task 3: Recheck the Full CLI Override Chain

**Files:**
- Modify: `packages/cli/tests/unit/emit.test.ts:161-372`

**Interfaces:**
- Consumes: unchanged `build`, `emitAll`, and canonical store behavior.
- Produces: an independently reviewable regression gate for the acceptance coverage introduced before Task 2's implementation.

- [ ] **Step 1: Confirm the override-chain fixture is complete**

Create default and user roots under the existing test sandbox. Write:

```text
defaults/base/base-agent.md
defaults/base/base-orchestrator.md
defaults/base/orchestrator.md
defaults/md-merger-root.yaml
user/user/base-orchestrator.md
user/md-merger-root.yaml
```

Confirm the Task 2 fixture uses these relationships:

```yaml
# defaults/md-merger-root.yaml
exports:
  base-orchestrator: base/base-orchestrator.md
```

```yaml
# user/md-merger-root.yaml
exports:
  base-orchestrator: user/base-orchestrator.md
```

`base/base-orchestrator.md` extends exact `base/base-agent.md`; `base/orchestrator.md` extends bare `base-orchestrator`; `user/base-orchestrator.md` extends exact `base/base-orchestrator.md`. Mark every base/user module abstract except `base/orchestrator.md`. Confirm the default uses `## Role`, the user module uses `## Subrole`, and the concrete module uses `## Description`, exactly as prescribed in Task 2.

After `build([defaults, user], ...)` and `emitAll(...)`, assert:

```ts
expect(written).toEqual([join(outputRoot, "base", "orchestrator.md")]);
const output = readFileSync(written[0]!, "utf-8");
expect(output).toContain("This is the concrete base orchestrator.");
expect(output).toContain("Orchestrator.");
expect(output).toContain("User Orchestrator.");
expect(output).not.toContain("This is the abstract base orchestrator.");
expect(output).not.toContain("This is the user's abstract base orchestrator.");
```

- [ ] **Step 2: Run the post-implementation acceptance gate**

Run:

```bash
bun test --cwd packages/cli tests/unit/emit.test.ts --test-name-pattern "root export"
```

Expected: PASS. Task 2 already established RED before implementation and GREEN afterward. If this gate fails, fix only alias canonicalization or fixture assumptions; do not alter merge semantics.

- [ ] **Step 3: Inspect the stored canonical chain**

Extend the same test with:

```ts
expect((await findLatest(storePath, "base/orchestrator"))?.extends)
  .toEqual(["user/base-orchestrator"]);
expect((await findLatest(storePath, "user/base-orchestrator"))?.extends)
  .toEqual(["base/base-orchestrator"]);
```

Run the focused test again. Expected: PASS.

- [ ] **Step 4: Run all CLI tests**

```bash
bun test --cwd packages/cli
```

Expected: all CLI tests pass.

- [ ] **Step 5: Record the gate result**

Do not create a test-only commit here because Task 2 already committed the acceptance test with its implementation. Record the passing focused and package test commands in the implementation handoff.

### Task 4: Verify the OpenCode Plugin Boundary

**Files:**
- Modify: `packages/opencode-plugin/tests/plugin.test.ts:86-127`

**Interfaces:**
- Consumes: plugin-created root order `[...bundledDefaults, ...config.rootDirs]` and unchanged CLI `build()` API.
- Produces: integration evidence that project aliases override bundled aliases without replacing exact module paths.

- [ ] **Step 1: Add the plugin integration test**

Add a serial test patterned after the existing bundled inheritance tests. Create one immediate bundled root at `defaults/agents` and one project root. Put bundled modules under `defaults/agents/base/...` and the bundled manifest at `defaults/agents/md-merger-root.yaml`, because `discoverDefaultRoots(defaults)` passes that immediate `agents` directory—not `defaults`—to `build()`. Put the project manifest at `<project-root>/md-merger-root.yaml`. Configure `emitDirs.agent`, initialize `createMdMergerPlugin(defaults)`, then apply its config hook.

Use the same distinct `## Description`, `## Role`, and `## Subrole` sections prescribed in Task 2; do not place all fixture bodies under the same heading.

Before applying the config hook, read the configured store and assert the concrete bundled module was canonicalized through the project alias while the project implementation retains its exact bundled parent:

```ts
expect((await findLatest(storePath, "base/orchestrator"))?.extends)
  .toEqual(["user/base-orchestrator"]);
expect((await findLatest(storePath, "user/base-orchestrator"))?.extends)
  .toEqual(["base/base-orchestrator"]);
```

Assert:

```ts
const prompt = (opencodeConfig.agent as Record<string, { prompt: string }>)["base/orchestrator"]?.prompt;
expect(prompt).toContain("This is the concrete base orchestrator.");
expect(prompt).toContain("Orchestrator.");
expect(prompt).toContain("User Orchestrator.");
expect((opencodeConfig.agent as Record<string, unknown>)["base/base-orchestrator"]).toBeUndefined();
expect((opencodeConfig.agent as Record<string, unknown>)["user/base-orchestrator"]).toBeUndefined();
```

- [ ] **Step 2: Run the focused plugin test**

```bash
bun test --cwd packages/opencode-plugin --test-name-pattern "root export"
```

Expected: PASS. A failure means root ordering or public API integration differs from the approved design.

- [ ] **Step 3: Run all plugin tests**

```bash
bun test --cwd packages/opencode-plugin
```

Expected: all plugin tests pass, including cwd restoration and initialization failure coverage.

- [ ] **Step 4: Add and run the invalid-manifest failure-boundary test**

Create a project root with a present `md-merger-root.yaml` whose export targets a missing same-root module. Initialize the plugin and assert:

```ts
const cwd = process.cwd();
const hooks = await createMdMergerPlugin(defaults)({ directory: root } as any);
expect(hooks).toEqual({});
expect(process.cwd()).toBe(cwd);
expect(process.env.MD_MERGER_CONFIG).toBe(configPath);
```

Also assert that the configured agent output was not created. Run:

```bash
bun test --cwd packages/opencode-plugin --test-name-pattern "invalid root export"
```

Expected: PASS, with the plugin logging the handled initialization error.

- [ ] **Step 5: Commit plugin coverage**

```bash
git add packages/opencode-plugin/tests/plugin.test.ts
git commit -m "test: verify project root export overrides"
```

### Task 5: Document Public Alias Semantics

**Files:**
- Modify: `README.md:233-295`
- Modify: `Justfile:1-15` only if its example remains misleading after README changes

**Interfaces:**
- Consumes: approved behavior and verified examples from Tasks 1-4.
- Produces: public documentation for root manifests and lookup precedence.

- [ ] **Step 1: Update Module Naming and Frontmatter documentation**

Under `README.md` Core Concepts, add a `Root Exports` subsection containing this valid example:

```yaml
exports:
  orchestrator: base/orchestrator.md
  base-orchestrator: base/base-orchestrator
```

State explicitly:

- the fixed filename is `md-merger-root.yaml` at a root's top level;
- the file is optional;
- targets belong to the same root;
- later roots replace earlier aliases;
- invalid manifests abort build before records are written.
- the manifest is a restricted YAML subset, not general YAML: it accepts blank lines, full-line comments, CRLF or LF, exactly one unindented `exports:`, and exactly two-space-indented unquoted scalar entries; it rejects quoted scalars, inline comments/maps, nested values, and extra top-level keys.

- [ ] **Step 2: Document exact and bare reference resolution**

Replace the one-line `extends` description with the ordered rules:

1. normalize separators and optional `.md`;
2. slash-qualified references are exact and bypass exports;
3. bare names consult the combined later-root-wins export registry;
4. an unexported bare name falls back to an exact root-level module.

Include the orchestrator injection chain and explain why exact inheritance preserves the default `Role` while the project alias adds `Subrole`.

- [ ] **Step 3: Synchronize Justfile examples if needed**

If `Justfile` implies bare imports are inferred globally, change its comments to use either an exact slash-qualified path or mention that a bare import must be exported (unless it names a root-level module). Do not alter recipes.

- [ ] **Step 4: Verify documentation references**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md Justfile
git commit -m "docs: explain root export aliases"
```

### Task 6: Cross-Package Verification and Independent Review

**Files:**
- Review only; fix files identified by failures or review findings.

**Interfaces:**
- Consumes: complete implementation from Tasks 1-5.
- Produces: executable evidence and independent correctness findings.

- [ ] **Step 1: Run repository tests**

```bash
bun test
```

Expected: all tests pass with zero failures. The plugin's intentional missing-root test may log its handled exception.

- [ ] **Step 2: Run strict type checking**

```bash
bun run typecheck
```

Expected: `tsc --noEmit` exits successfully.

- [ ] **Step 3: Verify the publish bundle boundary**

```bash
bun run bundle --cwd packages/cli
```

Expected: Bun writes the CLI bundle successfully with no unresolved imports. Do not commit `packages/cli/dist` changes.

- [ ] **Step 4: Dispatch mandatory independent verification**

Dispatch an `@oracle` reviewer with the approved design spec and changed-file list. Require it to:

- confirm exact references bypass aliases;
- confirm later-root aliases affect earlier-root modules because preflight completes first;
- confirm invalid manifests cannot partially append to the store;
- check duplicate-key and path traversal validation;
- verify no resolver/topology semantic regression;
- inspect CLI/plugin acceptance coverage; and
- report findings with severity and file/line evidence.

- [ ] **Step 5: Resolve every review finding through TDD**

For each valid finding, dispatch a bounded fixer. Add or adjust a failing regression test first, run it to confirm RED, make the minimum fix, and rerun the narrow test to GREEN. After any implementation task, dispatch another `@oracle` verification. Continue until the reviewer reports no blocking findings.

- [ ] **Step 6: Re-run final evidence after all fixes**

```bash
bun test
bun run typecheck
bun run bundle --cwd packages/cli
git diff --check
git status --short
```

Expected: tests, typecheck, bundle, and diff check pass; status lists only intended source, test, and documentation changes (plus any ignored generated artifacts).

- [ ] **Step 7: Commit review fixes if any**

Stage only reviewed source/test/documentation files and use a Conventional Commit message matching the correction, for example:

```bash
git add packages/cli/src/root-exports.ts packages/cli/tests/unit/root-exports.test.ts
git commit -m "fix: harden root export validation"
```

Do not amend earlier commits and do not commit generated artifacts.
