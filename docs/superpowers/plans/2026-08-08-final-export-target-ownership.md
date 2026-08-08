# Final Export Target Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenCode aliases belong only to their final later-root-wins export targets while preserving same-path overrides, ordinary inherited child agents, explicit project export replacement, canonical suppression, and development-time CLI-default discovery.

**Architecture:** `build()` already returns the final alias-to-canonical-target `exports` map and the cumulative `exportedModules` set. The plugin will derive alias injection exclusively from `exports`, use `exportedModules` only to suppress canonical keys for all current and superseded manifest targets, and remove the temporary descendant-inference/store-parsing workaround. Plugin-local defaults remain preferred for published packages, with CLI-package defaults as the development/file-plugin fallback.

**Tech Stack:** Bun, strict TypeScript, `bun:test`, Node ESM resolution and filesystem/path APIs, `@md-merger/cli`, `@md-merger/opencode-plugin`.

## Global Constraints

- Follow TDD for every behavior change: add or correct the focused integration test and observe the expected failure before changing production logic.
- Alias ownership comes only from the final `BuildResult.exports` map; never infer ownership through `extends`.
- Continue using `BuildResult.exportedModules` to suppress canonical OpenCode keys for every current or superseded export target.
- Preserve later-root same-module replacement, canonical inheritance resolution, abstract filtering, type routing, and alias-over-canonical collision precedence.
- Preserve explicit `createMdMergerPlugin(defaultsDir)` behavior for isolated tests and consumers.
- Prefer plugin-local `defaults/` when present; otherwise resolve `@md-merger/cli/package.json` and use its sibling `defaults/` without hard-coded repository paths.
- Do not parse the JSONL store inside the plugin to determine alias ownership.
- Do not add configuration or runtime dependencies.
- Do not modify or stage unrelated worktree files, including `NUL` and pre-existing spec/plan edits.

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

- Approved spec: `docs/superpowers/specs/2026-08-08-final-export-target-ownership-design.md`.
- `packages/cli/src/import.ts` returns `BuildResult { exports: Map<string, string>; exportedModules: Set<string> }`. `exports` contains only final later-root-wins alias ownership. `exportedModules` contains targets from every root manifest, including superseded targets.
- `packages/opencode-plugin/src/index.ts` currently contains two uncommitted runtime changes: a correct CLI-default fallback using `import.meta.resolve("@md-merger/cli/package.json")`, and an incorrect descendant-alias workaround that reads/parses the JSONL store and assigns parent aliases to direct concrete children.
- Keep the runtime-default fallback. Remove only the JSONL parsing and descendant alias propagation.
- `packages/opencode-plugin/tests/plugin.test.ts` currently has an uncommitted fallback regression whose expectation encodes the incorrect behavior: a project child without its own export receives `plan-o-strator`. Correct that test to expect both the bundled alias and the child's canonical key.
- Existing tests already cover final project export replacement, superseded target suppression, multiple aliases, abstract/non-agent filtering, unrelated fallback agents, and alias-over-canonical collision precedence. Strengthen or split them where needed rather than weakening assertions.
- Root processing order is bundled defaults first, project roots second. Same canonical module paths are replaced by later roots. Alias names are also replaced by later root manifests.
- Tests mutate `process.cwd()` and `MD_MERGER_CONFIG`; use unique `packages/opencode-plugin/tests/build/` fixtures and restore state in `finally`/`afterEach`.
- Environment requires Bun with installed workspace dependencies. Run commands from the repository root.

## File Structure

- Modify `packages/opencode-plugin/tests/plugin.test.ts`: encode all three approved behavior examples plus ambiguity guards.
- Modify `packages/opencode-plugin/src/index.ts`: retain runtime defaults fallback; remove store parsing and descendant alias inference; map aliases only from final `exports`.
- Modify `README.md`: document the three final-target ownership examples in the Root Exports section using public paths and expected OpenCode keys.
- Do not modify CLI resolver/import/store code; existing `BuildResult` metadata is sufficient.

---

### Task 1: Encode final-target-only ownership with integration tests

**Files:**
- Modify: `packages/opencode-plugin/tests/plugin.test.ts`

**Interfaces:**
- Consumes: `createMdMergerPlugin(defaultsDir: string): Plugin`, default `mdMergerPlugin`, `BuildResult.exports`, and `BuildResult.exportedModules` through the plugin boundary.
- Produces: focused integration evidence for the three approved behaviors and ambiguity guards.

- [ ] **Step 1: Correct the development-default fallback test for an unexported child**

Keep the project file `base/plan-o-strator.md` with bare inheritance:

```md
---
type: agent
extends: [plan-o-strator]
---
Project fallback child marker.
```

Keep the store assertion proving canonical inheritance:

```ts
expect(records.find((record) => record.name === "base/plan-o-strator")?.extends)
  .toEqual(["base/core/plan-o-strator"]);
```

Replace the incorrect alias-only assertions with the approved new-child behavior:

```ts
const agents = config.agent as Record<string, { prompt: string }>;
expect(Object.keys(agents).filter((key) => key.includes("plan-o-strator")).sort())
  .toEqual(["base/plan-o-strator", "plan-o-strator"]);
expect(agents["plan-o-strator"]?.prompt)
  .toContain("You are a workflow manager for planning work.");
expect(agents["plan-o-strator"]?.prompt)
  .not.toContain("Project fallback child marker.");
expect(agents["base/plan-o-strator"]?.prompt)
  .toContain("You are a workflow manager for planning work.");
expect(agents["base/plan-o-strator"]?.prompt)
  .toContain("Project fallback child marker.");
expect(agents["base/core/plan-o-strator"]).toBeUndefined();
```

- [ ] **Step 2: Add the same-path override test**

Create a temporary bundled root with:

```text
defaults/agents/md-merger-root.yaml
defaults/agents/base/core/plan-o-strator.md
```

and a project root with the same canonical module path:

```text
project/base/core/plan-o-strator.md
```

The bundled manifest is:

```yaml
exports:
  plan-o-strator: base/core/plan-o-strator.md
```

Use distinguishable prompt markers and assert:

```ts
expect(Object.keys(agents).filter((key) => key.includes("plan-o-strator")))
  .toEqual(["plan-o-strator"]);
expect(agents["plan-o-strator"]?.prompt).toContain("Project same-path replacement.");
expect(agents["plan-o-strator"]?.prompt).not.toContain("Bundled same-path content.");
expect(agents["base/core/plan-o-strator"]).toBeUndefined();
```

- [ ] **Step 3: Strengthen the explicit project-export replacement test**

Use these roots:

```text
defaults/agents/base/core/plan-o-strator.md
project/base/plan-o-strator.md
```

The project child must inherit canonically:

```md
---
type: agent
extends: [base/core/plan-o-strator]
---
Project exported child marker.
```

The manifests are:

```yaml
# defaults/agents/md-merger-root.yaml
exports:
  plan-o-strator: base/core/plan-o-strator.md
```

```yaml
# project/md-merger-root.yaml
exports:
  plan-o-strator: base/plan-o-strator.md
```

Assert the final project target is the only related OpenCode key and contains merged content:

```ts
expect(Object.keys(agents).filter((key) => key.includes("plan-o-strator")).sort())
  .toEqual(["plan-o-strator"]);
expect(agents["plan-o-strator"]?.prompt).toContain("Bundled inherited marker.");
expect(agents["plan-o-strator"]?.prompt).toContain("Project exported child marker.");
expect(agents["base/core/plan-o-strator"]).toBeUndefined();
expect(agents["base/plan-o-strator"]).toBeUndefined();
```

- [ ] **Step 4: Add ambiguity guards for multiple descendants and an unrelated agent**

Create one exported concrete base and two project children that both extend it, without a project export override. Add an unrelated project agent. Assert:

```ts
expect(agents["base-alias"]?.prompt).toContain("Exported base marker.");
expect(agents["project/first"]?.prompt).toContain("First child marker.");
expect(agents["project/second"]?.prompt).toContain("Second child marker.");
expect(agents["project/unrelated"]?.prompt).toContain("Unrelated marker.");
expect(agents["base/concrete"]).toBeUndefined();
```

Also assert neither child prompt was installed under `base-alias`. This proves descendants never compete for alias ownership.

- [ ] **Step 5: Retain and tighten multi-alias final-target coverage**

Keep the existing fixture where `first` and `second` both target `base/multi`. Assert exact alias prompts and canonical suppression:

```ts
expect(agents.first?.prompt).toContain("Multi alias prompt.");
expect(agents.second?.prompt).toBe(agents.first?.prompt);
expect(agents["base/multi"]).toBeUndefined();
```

- [ ] **Step 6: Run focused tests and verify RED**

Run:

```bash
bun test --cwd packages/opencode-plugin tests/plugin.test.ts
```

Expected: the corrected new-child and multiple-descendant assertions fail because the current workaround propagates the exported parent's alias to descendants; the explicit project-export and same-path cases may already pass.

- [ ] **Step 7: Commit test evidence**

```bash
git add packages/opencode-plugin/tests/plugin.test.ts
git commit -m "test(plugin): define final export ownership"
```

### Task 2: Remove descendant alias inference and preserve runtime defaults fallback

**Files:**
- Modify: `packages/opencode-plugin/src/index.ts`
- Test: `packages/opencode-plugin/tests/plugin.test.ts`

**Interfaces:**
- Consumes: `BuildResult.exports` as final alias ownership and `BuildResult.exportedModules` as cumulative canonical-suppression metadata.
- Produces: aliases only for exact final targets; canonical fallbacks only for modules never targeted by any root export.

- [ ] **Step 1: Preserve dynamic runtime defaults selection**

Keep this package-relative resolution behavior:

```ts
const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageDefaultsDir = join(moduleDir, "..", "defaults");
const cliDefaultsDir = join(
  dirname(fileURLToPath(import.meta.resolve("@md-merger/cli/package.json"))),
  "defaults",
);
const runtimeDefaultsDir = existsSync(packageDefaultsDir)
  ? packageDefaultsDir
  : cliDefaultsDir;
```

Keep:

```ts
export const mdMergerPlugin: Plugin = createMdMergerPlugin(runtimeDefaultsDir);
```

Do not change `createMdMergerPlugin(defaultsDir)` to resolve or replace its explicit argument.

- [ ] **Step 2: Delete JSONL-store parsing and descendant alias propagation**

Remove the block that reads `config.storeFile`, parses records, identifies concrete agents, and copies parent aliases to children. The complete alias lookup must remain only:

```ts
const aliasesByModule = new Map<string, string[]>();
for (const [alias, moduleName] of exports) {
  const aliases = aliasesByModule.get(moduleName) ?? [];
  aliases.push(alias);
  aliasesByModule.set(moduleName, aliases);
}
```

Do not add replacement ancestry traversal, selection rules, or store-format coupling.

- [ ] **Step 3: Preserve exact-target injection and cumulative suppression**

Keep emitted-agent routing equivalent to:

```ts
const aliases = aliasesByModule.get(key);
if (aliases === undefined) {
  if (!exportedModules.has(key)) fallbackAgentPrompts.set(key, prompt);
} else {
  for (const alias of aliases) exportedAgentPrompts.set(alias, prompt);
}
```

Keep fallback application before exported prompts so an explicit alias wins a colliding canonical fallback key.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
bun test --cwd packages/opencode-plugin tests/plugin.test.ts
```

Expected: all ownership, runtime-default fallback, abstract/type filtering, collision precedence, and failure-boundary tests pass.

- [ ] **Step 5: Run package type checking**

Run:

```bash
bun run typecheck
```

Expected: TypeScript exits successfully with no diagnostics. Removing store parsing should also remove any test-only metadata types introduced solely for that block.

- [ ] **Step 6: Commit implementation**

```bash
git add packages/opencode-plugin/src/index.ts packages/opencode-plugin/tests/plugin.test.ts
git commit -m "fix(plugin): bind aliases to final export targets"
```

- [ ] **Step 7: Request mandatory independent Oracle verification**

Ask Oracle to verify all three spec examples, multiple-descendant ambiguity prevention, unrelated canonical fallback, multi-alias behavior, superseded-target suppression, and dynamic CLI-default fallback. Do not proceed while any material finding remains open.

### Task 3: Document ownership examples and verify the workspace

**Files:**
- Modify: `README.md`
- Verify: repository suites and worktree scope

**Interfaces:**
- Documents the public relationship between canonical module paths, inheritance, root exports, and OpenCode agent keys.
- Produces final cross-package evidence without changing CLI semantics.

- [ ] **Step 1: Add all three public examples to the Root Exports documentation**

Document these outcomes concisely:

```text
Same-path project override:
plan-o-strator -> project replacement content
```

```text
Different-path child without project export:
plan-o-strator      -> bundled target
base/plan-o-strator -> merged project child
```

```text
Different-path child with project export replacement:
plan-o-strator -> merged project child
```

State that `extends` never transfers alias ownership; only the final root-export map does. State that canonical keys for every manifest target, including superseded targets, remain suppressed.

- [ ] **Step 2: Run package and workspace verification**

Run:

```bash
bun test --cwd packages/opencode-plugin
bun test
bun run typecheck
git diff --check
```

Expected: all tests pass with zero failures, TypeScript emits no diagnostics, and Git reports no whitespace errors.

- [ ] **Step 3: Inspect scope and generated artifacts**

Run:

```bash
git status --short
```

Expected: only intended plugin source/test, README, spec, and plan changes are present. Do not stage generated plugin defaults, stores, emitted output, test build artifacts, `NUL`, or unrelated pre-existing docs edits.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md docs/superpowers/specs/2026-08-08-final-export-target-ownership-design.md docs/superpowers/plans/2026-08-08-final-export-target-ownership.md
git commit -m "docs: define final export ownership"
```

- [ ] **Step 5: Request final Oracle review**

Ask Oracle to review the complete branch diff against the approved spec and verify test legitimacy, package boundaries, runtime-default resolution, and absence of descendant alias inference. Resolve all material findings before completion.

## Verification Criteria

- Development/file-loaded plugin runs include CLI package defaults even when plugin-local generated defaults are absent.
- Same-path project replacement is injected only under the existing final alias with project content.
- A different-path project child without a project export remains under its canonical key while the bundled target retains the alias.
- A different-path project child explicitly exported under the same alias becomes the sole alias owner and includes inherited bundled content.
- Multiple descendants never compete for or silently overwrite a parent's alias.
- Unrelated concrete agents retain canonical keys.
- Multiple final aliases targeting one module all receive the same prompt, and the target's canonical key is suppressed.
- Current and superseded export targets never appear under canonical OpenCode keys.
- The plugin does not parse the JSONL store to infer alias ownership.
- `bun test` and `bun run typecheck` pass.

## Execution Notes

- Execute with `subagent-driven-development` and TDD task-by-task.
- This is a bounded plugin correction; `deepwork` is required only if implementation reveals broader architectural dependencies or repeated failed fixes.
- After every implementation subagent task, dispatch the mandatory independent Oracle verification required by the orchestrator workflow.
- Preserve the existing uncommitted runtime-default fallback while removing the uncommitted descendant-alias workaround.
