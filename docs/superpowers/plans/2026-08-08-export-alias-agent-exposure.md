# Export Alias Agent Exposure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose concrete OpenCode agents under their active root-export aliases while preserving canonical names for unexported agents and leaving inheritance, storage, and emission unchanged.

**Architecture:** `build()` remains the sole loader and merger of root manifests and returns its final alias-to-canonical-module map as metadata. The OpenCode plugin reverses that map for each emitted agent: matching aliases replace the canonical OpenCode key, while agents with no matching alias retain the existing path-derived key. Emission still writes canonical paths and inheritance still stores canonical references.

**Tech Stack:** Bun, TypeScript, `bun:test`, Node filesystem/path APIs, `@md-merger/cli`, `@opencode-ai/plugin`.

## Global Constraints

- Do not change `extends` normalization or resolution.
- Do not change module identity, store record names, inheritance topology, merge behavior, abstract filtering, output routing, or emitted file paths.
- Do not alter root-export manifest grammar or validation.
- Do not expose aliases for abstract or non-agent modules.
- Exported concrete agents are exposed only by active aliases; unexported concrete agents retain canonical path-derived names.
- Every active alias targeting one concrete agent is exposed.
- Later roots replace earlier targets for the same alias.
- Add no runtime dependencies.

## Required Skills

> The agent executing this plan **MUST** invoke the `subagent-driven-development` skill for implementation execution.
>
> For large, high-risk, or multi-phase efforts, the agent **MUST** also invoke the `deepwork` skill.
>
> Do **NOT** read the content of these skills — just invoke them and follow their defined workflow. The skill descriptions in the system prompt tell you when each applies.

> **⚠️ BEFORE IMPLEMENTATION:** You must invoke the `subagent-driven-development` skill (and `deepwork` if this is a large effort). This is not optional. Do not skip this step.

## Fresh-Session Context

- Approved spec: `docs/superpowers/specs/2026-08-08-export-alias-agent-exposure-design.md`.
- `packages/cli/src/root-exports.ts` validates each restricted manifest and returns a root-local `Map<string, string>`.
- `packages/cli/src/import.ts` currently merges those maps in root order inside `build()`, uses the result to canonicalize bare `extends`, and returns `Promise<void>`.
- `packages/cli/src/api.ts` exports `build()` to integration packages.
- `packages/cli/src/emit.ts` emits concrete modules at canonical nested paths and returns `EmittedFile` metadata containing path and type.
- `packages/opencode-plugin/src/index.ts` calls `build()`, emits modules, derives canonical agent keys from emitted paths, reads prompts, and injects them into OpenCode.
- `packages/opencode-plugin/tests/plugin.test.ts` owns serial end-to-end fixtures across defaults, project roots, CLI build/emit, and OpenCode config injection.
- `README.md` documents root exports as inheritance aliases and must describe their additional OpenCode naming effect without implying module renaming.
- The worktree may contain unrelated changes, including `prompts.jsonl` and edits to the approved spec. Do not modify, stage, or revert them.
- No environment setup beyond the existing Bun workspace is required. Tests set `MD_MERGER_CONFIG` to temporary fixture configurations and restore process state during cleanup.

## File Structure

- Modify `packages/cli/src/import.ts`: define exported `BuildResult` metadata and return the final merged exports map from `build()` after records are written.
- Modify `packages/cli/src/api.ts`: export `BuildResult` for public API consumers.
- Modify `packages/opencode-plugin/src/index.ts`: consume build metadata and choose alias keys only at the OpenCode injection boundary.
- Modify `packages/opencode-plugin/tests/plugin.test.ts`: add boundary-level acceptance coverage and preserve canonical inheritance assertions.
- Modify `README.md`: document aliases as OpenCode-facing names for concrete agents.

---

### Task 1: Return merged root-export metadata from the CLI build

**Files:**
- Modify: `packages/cli/src/import.ts:35-106`
- Modify: `packages/cli/src/api.ts:6`
- Test: `packages/cli/tests/unit/import.test.ts:129-141`

**Interfaces:**
- Consumes: `loadRootExports(rootDir, moduleNames): Promise<Map<string, string>>`.
- Produces: `BuildResult { exports: Map<string, string> }` and `build(...): Promise<BuildResult>`.
- Preserves: all store writes and canonical `extends` values.

- [ ] **Step 1: Extend the existing CLI test with a failing metadata assertion**

After the fixture setup in `composes later-root exports and canonicalizes extends`, capture the result and assert both later-root metadata and canonical storage:

```ts
const result = await build([rootA, rootB], storePath, "test-project");
expect(result.exports).toEqual(new Map([["implementation", "user/implementation"]]));
expect((await findLatest(storePath, "base/concrete"))?.extends).toEqual(["user/implementation"]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test --cwd packages/cli tests/unit/import.test.ts`

Expected: FAIL because `build()` currently returns `undefined`, so `result.exports` cannot be read.

- [ ] **Step 3: Return the minimal build metadata**

In `packages/cli/src/import.ts`, add and use:

```ts
export interface BuildResult {
  exports: Map<string, string>;
}

export async function build(
  rootDirs: string[],
  storePath: string,
  project: string,
): Promise<BuildResult> {
  // Keep existing scan, manifest merge, and record-import logic unchanged.
  return { exports };
}
```

In `packages/cli/src/api.ts`, add:

```ts
export { build } from "./import";
export type { BuildResult } from "./import";
```

- [ ] **Step 4: Run the focused CLI test and verify GREEN**

Run: `bun test --cwd packages/cli tests/unit/import.test.ts`

Expected: all tests in `import.test.ts` pass, including the later-root export map and unchanged canonical `extends` assertion.

- [ ] **Step 5: Commit the CLI metadata change**

```bash
git add packages/cli/src/import.ts packages/cli/src/api.ts packages/cli/tests/unit/import.test.ts
git commit -m "feat(cli): return merged root exports from build"
```

### Task 2: Select OpenCode agent keys from active aliases

**Files:**
- Modify: `packages/opencode-plugin/src/index.ts:25-50`
- Test: `packages/opencode-plugin/tests/plugin.test.ts:130-154`

**Interfaces:**
- Consumes: `BuildResult.exports`, a final `Map<alias, canonicalModuleName>` whose duplicate aliases already obey later-root-wins.
- Produces: OpenCode `agent` entries keyed by all aliases targeting each emitted concrete agent, or by the existing canonical key when no alias targets it.
- Preserves: emitted paths, prompt contents, abstract filtering, non-agent filtering, and replacement of existing OpenCode entries.

- [ ] **Step 1: Write failing plugin acceptance cases**

Update the existing root-export fixture so the default concrete module is also exported and assert:

```ts
writeFileSync(
  join(bundled, "md-merger-root.yaml"),
  "exports:\n  orchestrator: base/orchestrator.md\n  base-orchestrator: base/base-orchestrator.md\n",
);

const agents = opencodeConfig.agent as Record<string, { prompt: string }>;
expect(agents.orchestrator?.prompt).toContain("User Orchestrator.");
expect(agents["base/orchestrator"]).toBeUndefined();
```

Add one fixture that creates:

```yaml
# defaults manifest
exports:
  shared: default/default-agent.md
  first-name: default/multi.md
  second-name: default/multi.md
```

```yaml
# project manifest
exports:
  shared: user/user-agent.md
```

The fixture must also include concrete `default/default-agent`, `default/multi`, `user/user-agent`, and `user/unexported` agents. Assert:

```ts
expect(agents.shared.prompt).toContain("Project shared agent.");
expect(agents.shared.prompt).not.toContain("Default shared agent.");
expect(agents["default/default-agent"]).toBeUndefined();
expect(agents["user/user-agent"]).toBeUndefined();
expect(agents["first-name"].prompt).toContain("Multi-alias agent.");
expect(agents["second-name"].prompt).toContain("Multi-alias agent.");
expect(agents["default/multi"]).toBeUndefined();
expect(agents["user/unexported"].prompt).toContain("Unexported agent.");
```

Keep each fixture under a unique temporary directory and restore `process.cwd()` and files in `finally`.

- [ ] **Step 2: Run plugin tests and verify RED**

Run: `bun test --cwd packages/opencode-plugin tests/plugin.test.ts`

Expected: alias-key assertions fail because the plugin still injects canonical path-derived keys.

- [ ] **Step 3: Implement alias-only key selection at the plugin boundary**

Capture build metadata:

```ts
const { exports } = await build(rootDirs, config.storeFile, config.project);
```

Before iterating emitted files, reverse the map without changing its values:

```ts
const aliasesByModule = new Map<string, string[]>();
for (const [alias, moduleName] of exports) {
  const aliases = aliasesByModule.get(moduleName) ?? [];
  aliases.push(alias);
  aliasesByModule.set(moduleName, aliases);
}
```

For each emitted agent, retain `toAgentKey()` as the canonical path and select keys only for injection:

```ts
const canonicalKey = toAgentKey(agentRoot, resolve(emittedFile.path));
if (canonicalKey === undefined) continue;
try {
  const prompt = await readFile(resolve(emittedFile.path), "utf-8");
  const keys = aliasesByModule.get(canonicalKey) ?? [canonicalKey];
  for (const key of keys) agentPrompts.set(key, prompt);
} catch {
  console.warn(`[md-merger] Failed to read emitted agent: ${emittedFile.path}`);
}
```

Do not change build order, emission, or config mutation.

- [ ] **Step 4: Run plugin tests and verify GREEN**

Run: `bun test --cwd packages/opencode-plugin tests/plugin.test.ts`

Expected: all plugin tests pass. The tests directly establish alias-only exposure, later-root alias collision behavior, multiple aliases, unexported fallback names, and unchanged inherited prompt content.

- [ ] **Step 5: Commit plugin behavior and tests**

```bash
git add packages/opencode-plugin/src/index.ts packages/opencode-plugin/tests/plugin.test.ts
git commit -m "feat(plugin): expose agents by export alias"
```

### Task 3: Document and verify the public behavior

**Files:**
- Modify: `README.md:239-269`

**Interfaces:**
- Documents: root exports remain inheritance aliases and additionally define OpenCode names only for emitted concrete agents.
- Verifies: CLI/plugin boundary behavior plus workspace type safety.

- [ ] **Step 1: Update Root Exports documentation**

After the later-root merge paragraph, add:

```md
The OpenCode plugin also uses the final export map as its public agent-name registry. A concrete `type: agent` module targeted by one or more active aliases is injected under each alias instead of its canonical module path. An unexported concrete agent keeps its path-derived name. If multiple roots publish the same alias, only the last root's target is exposed under that name. This affects only OpenCode agent keys; module names, inheritance, store records, and emitted paths remain canonical.
```

- [ ] **Step 2: Run the narrow package suites**

Run: `bun test --cwd packages/cli && bun test --cwd packages/opencode-plugin`

Expected: both package suites pass with zero failures.

- [ ] **Step 3: Run cross-package type verification**

Run: `bun run typecheck`

Expected: TypeScript exits successfully with no diagnostics, proving the changed public `build()` return type is valid across the workspace.

- [ ] **Step 4: Inspect the final diff for scope**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the intended README and implementation/test files plus pre-existing unrelated worktree changes appear.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md
git commit -m "docs: describe alias-based agent names"
```

## Verification Criteria

- `bun test --cwd packages/cli` passes.
- `bun test --cwd packages/opencode-plugin` passes.
- `bun run typecheck` passes.
- Plugin fixtures show one user-selected prompt at a colliding alias, every active alias for a multiply exported concrete agent, canonical fallback for an unexported agent, and no canonical key for exported agents.
- Existing store assertions still contain canonical `extends` paths.
- Emitted files remain at canonical module paths.
- No generated defaults, stores, output directories, `dist`, or test artifacts are committed.
