# Plugin CLI Pipeline Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route bundled plugin defaults and project modules through one CLI-owned build/emit pipeline so only concrete, inheritance-resolved agents reach OpenCode.

**Architecture:** `packages/cli` keeps sole ownership of Markdown discovery, frontmatter parsing, ordered-root precedence, inheritance resolution, abstract filtering, type routing, and emission. Import precedence changes from first-root-wins to later-root-wins, and emission preserves nested module paths instead of flattening them. `packages/opencode-plugin` becomes an adapter that calls exported CLI APIs directly, prepends dynamically discovered `defaults/` roots to the user's configured roots, and injects emitted agent prompts into OpenCode's supplied config object.

**Tech Stack:** TypeScript, Bun, `bun:test`, Node filesystem APIs (`node:fs`, `node:fs/promises`, `node:path`, `node:url`), OpenCode plugin API (`@opencode-ai/plugin`).

## Required Skills

> The agent executing this plan **MUST** invoke the `subagent-driven-development` skill for implementation execution.
>
> For large, high-risk, or multi-phase efforts, the agent **MUST** also invoke the `deepwork` skill.
>
> Do **NOT** read the content of these skills — just invoke them and follow their defined workflow. The skill descriptions in the system prompt tell you when each applies.

> **⚠️ BEFORE IMPLEMENTATION:** You must invoke the `subagent-driven-development` and `deepwork` skills. This is a cross-package behavior change affecting CLI precedence, persistent stores, output paths, plugin integration, and repository guidance. This is not optional.

## Global Constraints

- `packages/cli` is the sole Markdown-processing core; the plugin must not traverse raw Markdown, parse frontmatter, resolve inheritance, or decide abstract versus concrete status.
- The plugin calls exported CLI package APIs directly; it must not invoke CLI commands, spawn a subprocess, or simulate command-line interactions.
- The cwd-resolved user configuration is authoritative: preserve `rootDirs`, every `emitDirs` route, `storeFile`, `project`, `version`, `maxInheritDepth`, and other loaded settings.
- Every immediate directory under the installed plugin package's `defaults/` directory is prepended to configured project roots dynamically; non-directory entries are ignored.
- Bundled default roots are processed first and project roots second; later project modules override earlier defaults with the same module path.
- Every `abstract: true` module is inheritance-only and is never emitted or registered, regardless of source root.
- Concrete module output is selected from its `type` frontmatter via `emitDirs.<type>`; source folder names do not select output directories.
- Nested module paths are preserved in emitted directories and OpenCode agent keys; flattened output naming is removed.
- Resolved module paths are assumed unique; collision handling beyond later-root override semantics is deferred to a separate follow-up.
- The plugin reads only emitted agent outputs from `emitDirs.agent` for OpenCode `agent` injection; non-agent output routes remain user-configured but are not injected as agents.
- When no user configuration file exists, the CLI default configuration must route `type: agent` to `.opencode/agents` and `type: skill` to `.opencode/skills`, both resolved against the working directory. A user configuration may replace these routes.
- When an emitted plugin agent key already exists in OpenCode's supplied `agent` configuration, the plugin replaces that entry with its generated `{ prompt: content }` value.
- Do not create temporary directories, alternate stores, alternate output directories, CLI processes, or runtime dependencies.
- Existing `just build-local` and `prepublishOnly` defaults-copy mechanisms remain unchanged.
- Do not modify npm publish workflows or the `prepublishOnly` script.
- Tests that change `process.cwd()` or `MD_MERGER_CONFIG` must restore both, including on failure paths.

---

### Task 1: Ordered import precedence and nested emission paths

**Files:**
- Create: none
- Modify: `packages/cli/src/import.ts:24-89`
- Modify: `packages/cli/src/emit.ts:120-180`
- Modify: `packages/cli/src/config.ts:119-134`
- Modify: `packages/cli/src/types.ts:39-44`
- Modify: `packages/cli/tests/unit/import.test.ts:94-108`
- Modify: `packages/cli/tests/unit/emit.test.ts`
- Modify: `packages/cli/tests/unit/config.test.ts`
- Delete: none
- Test: `packages/cli/tests/unit/import.test.ts` and `packages/cli/tests/unit/emit.test.ts`

**Interfaces:**
- Consumes: `findLatest(storePath: string, name: string) -> Promise<PromptRecord | undefined>` and `updateOrCreate(storePath: string, name: string, project: string, patch: Partial<PromptRecord>) -> Promise<PromptRecord>` from `packages/cli/src/store.ts`.
- Produces: `build(rootDirs: string[], storePath: string, project: string) -> Promise<void>` with later-root-wins precedence.
- Produces: `emitAll(storePath: string, emitDirs: Record<string, string>, config: Config, dryRun?: boolean) -> Promise<string[]>` returning nested paths shaped `<emitDirs[type]>/<module/path>.md`.
- Produces: `DEFAULT_CONFIG.emitDirs` containing `agent` and `skill` routes consumed by Task 2.
- Produces: `loadConfig() -> Promise<Config>` that clones nested defaults before cwd-relative path resolution, so separate no-config loads cannot contaminate one another.

- [ ] **Step 1: Rewrite the CLI precedence test to expect later-root-wins**

Replace the existing test at `packages/cli/tests/unit/import.test.ts:94-108` with:

```typescript
  test("last root dir wins when same module name exists in multiple roots", async () => {
    const rootA = join(rootDir, "a");
    const rootB = join(rootDir, "b");
    mkdirSync(rootA, { recursive: true });
    mkdirSync(rootB, { recursive: true });

    writeFileSync(join(rootA, "base.md"), "---\nname: BaseA\n---\n## Role\nRole from A.");
    writeFileSync(join(rootB, "base.md"), "---\nname: BaseB\n---\n## Role\nRole from B.");

    await build([rootA, rootB], storePath, "test-project");

    const record = await findLatest(storePath, "base");
    expect(record).toBeDefined();
    expect(record!.frontmatter).toHaveProperty("name", "BaseB");
    expect(record!.sections[0]?.body).toBe("Role from B.");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test --cwd packages/cli tests/unit/import.test.ts`
Expected: FAIL on `last root dir wins when same module name exists in multiple roots` with received `name: "BaseA"`.

- [ ] **Step 3: Remove the first-root-wins skip in `build()`**

In `packages/cli/src/import.ts`, replace the doc comment at lines 24-30 and delete the `seen` set. The function becomes:

```typescript
/**
 * Glob `.md` files from each rootDir, parse them, and write records to the JSONL store.
 *
 * Root dirs are processed in order and later roots win. When a module path appears in
 * more than one root, the later root's content is written as a newer store version, so
 * store dedup-by-latest-version selects it.
 */
export async function build(
  rootDirs: string[],
  storePath: string,
  project: string,
): Promise<void> {
  for (const rootDir of rootDirs) {
    const files = await globMd(rootDir);

    for (const filepath of files) {
      const modulePath = relative(rootDir, filepath)
        .replace(/\.md$/, "")
        .replace(/\\/g, "/");

      const content = await readFile(filepath, "utf-8");
      const { metadata, body } = extractFrontmatter(content);
      const sections = parseSections(body);

      const extendsArr = Array.isArray(metadata.extends)
        ? (metadata.extends as string[])
        : undefined;
      const abstractBool = metadata.abstract === true;

      // Guard against empty strings to prevent confusing warnings during emit
      const typeValue = typeof metadata.type === "string" && metadata.type.length > 0
        ? (metadata.type as string).trim()
        : undefined;

      const existing = await findLatest(storePath, modulePath);

      // Build the patch object — for updates, only include type if it has a value
      // to avoid erasing the existing record's type on re-import
      const patch: Partial<PromptRecord> = {
        sections,
        frontmatter: metadata,
        extends: extendsArr,
        abstract: abstractBool,
      };

      if (typeValue !== undefined) {
        patch.type = typeValue;
      }

      if (existing) {
        await updateOrCreate(storePath, modulePath, project, patch);
      } else {
        await updateOrCreate(storePath, modulePath, project, {
          ...patch,
          status: "active",
        });
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test --cwd packages/cli tests/unit/import.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Write the failing nested-emission test**

Append this test to `packages/cli/tests/unit/emit.test.ts`, inside its existing top-level `describe` block. Match the file's existing fixture style for `storePath`/`rootDir` setup; the test body is:

```typescript
  test("emits nested module paths under the type route and skips abstract modules", async () => {
    const inputRoot = join(rootDir, "input");
    const outputRoot = join(rootDir, "out-nested");
    mkdirSync(join(inputRoot, "base", "core"), { recursive: true });

    writeFileSync(
      join(inputRoot, "base", "BasePrimaryAgent.md"),
      "---\ntype: agent\nabstract: true\n---\n## Role\nBase primary content.",
    );
    writeFileSync(
      join(inputRoot, "base", "core", "plan-o-strator.md"),
      "---\ntype: agent\nextends: [base/BasePrimaryAgent]\nabstract: false\n---\n## Role\nConcrete orchestration content.",
    );

    await build([inputRoot], storePath, "test-project");

    const config = {
      project: "test-project",
      version: "1",
      maxInheritDepth: 5,
      storeFile: storePath,
      emitDirs: { agent: outputRoot },
      rootDirs: [inputRoot],
    };

    const written = await emitAll(storePath, config.emitDirs, config, false);

    expect(written).toContain(join(outputRoot, "base", "core", "plan-o-strator.md"));
    expect(written.some((p) => p.includes("BasePrimaryAgent"))).toBe(false);
    expect(existsSync(join(outputRoot, "base", "core", "plan-o-strator.md"))).toBe(true);
    expect(existsSync(join(outputRoot, "base_core_plan-o-strator.md"))).toBe(false);
  });
```

Ensure the file imports `build` from `../../src/import`, `emitAll` from `../../src/emit`, and `existsSync`/`mkdirSync`/`writeFileSync` from `node:fs`, plus `join` from `node:path`, adding only the imports not already present.

- [ ] **Step 6: Run the test to verify it fails**

Run: `bun test --cwd packages/cli tests/unit/emit.test.ts`
Expected: FAIL — written path is `<outputRoot>/base_core_plan-o-strator.md`, so `toContain` on the nested path fails.

- [ ] **Step 7: Preserve nested paths in `emitAll()`**

In `packages/cli/src/emit.ts`, replace lines 153-155:

```typescript
    // Build output filename: replace / with _
    const safeName = name.replace(/\//g, "_");
    const filePath = `${targetDir}/${safeName}.md`;
```

with:

```typescript
    // Preserve the module's nested path beneath its type-routed output directory
    const { join: joinPath } = await import("node:path");
    const filePath = joinPath(targetDir, `${name}.md`);
```

Also update the doc comment at line 85 from `- Write to ${targetDir}/${name}.md (replace / with _ in name)` to `- Write to ${targetDir}/${name}.md, preserving nested module path segments`.

- [ ] **Step 8: Run the test to verify it passes**

Run: `bun test --cwd packages/cli tests/unit/emit.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing default-config route test**

Append to `packages/cli/tests/unit/emit.test.ts`:

```typescript
  test("default config routes agent and skill types to .opencode directories", async () => {
    expect(DEFAULT_CONFIG.emitDirs.agent).toBe(".opencode/agents");
    expect(DEFAULT_CONFIG.emitDirs.skill).toBe(".opencode/skills");
  });
```

Add `import { DEFAULT_CONFIG } from "../../src/types";` if the file does not already import it.

- [ ] **Step 10: Run the test to verify it fails**

Run: `bun test --cwd packages/cli tests/unit/emit.test.ts`
Expected: FAIL with `expected undefined to be ".opencode/agents"`.

- [ ] **Step 11: Add default agent and skill routes**

In `packages/cli/src/types.ts`, replace lines 39-44:

```typescript
export const DEFAULT_CONFIG: Omit<Config, "project" | "version"> = {
  maxInheritDepth: DEFAULT_MAX_INHERIT_DEPTH,
  storeFile: "prompts.jsonl",
  emitDirs: { default: "output" },
  rootDirs: [".md-merger/agents-root/input"],
};
```

with:

```typescript
export const DEFAULT_CONFIG: Omit<Config, "project" | "version"> = {
  maxInheritDepth: DEFAULT_MAX_INHERIT_DEPTH,
  storeFile: "prompts.jsonl",
  emitDirs: {
    default: "output",
    agent: ".opencode/agents",
    skill: ".opencode/skills",
  },
  rootDirs: [".md-merger/agents-root/input"],
};
```

- [ ] **Step 12: Run the CLI suite to verify it passes**

Before the full suite, add this regression to `packages/cli/tests/unit/config.test.ts` inside `describe("loadConfig emitDirs", ...)`:

```typescript
  test("no-config loads resolve independent cwd routes without mutating shared defaults", async () => {
    const originalCwd = process.cwd();
    const originalConfig = process.env.MD_MERGER_CONFIG;
    const rootA = join(baseTempDir, "no-config-a-" + Math.random().toString(36).slice(2));
    const rootB = join(baseTempDir, "no-config-b-" + Math.random().toString(36).slice(2));
    mkdirSync(join(rootA, ".md-merger", "agents-root", "input"), { recursive: true });
    mkdirSync(join(rootB, ".md-merger", "agents-root", "input"), { recursive: true });
    delete process.env.MD_MERGER_CONFIG;

    try {
      process.chdir(rootA);
      const configA = await loadConfig();
      process.chdir(rootB);
      const configB = await loadConfig();

      expect(configA.emitDirs.agent).toBe(join(rootA, ".opencode", "agents"));
      expect(configA.emitDirs.skill).toBe(join(rootA, ".opencode", "skills"));
      expect(configB.emitDirs.agent).toBe(join(rootB, ".opencode", "agents"));
      expect(configB.emitDirs.skill).toBe(join(rootB, ".opencode", "skills"));
      expect(DEFAULT_CONFIG.emitDirs.agent).toBe(".opencode/agents");
      expect(DEFAULT_CONFIG.emitDirs.skill).toBe(".opencode/skills");
      expect(DEFAULT_CONFIG.rootDirs).toEqual([".md-merger/agents-root/input"]);
    } finally {
      process.chdir(originalCwd);
      if (originalConfig === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = originalConfig;
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
  });
```

Add `import { DEFAULT_CONFIG } from "../../src/types";` to the test file.

Run: `bun test --cwd packages/cli tests/unit/config.test.ts`
Expected before the config fix: FAIL because the second result reuses the first cwd's absolute routes and `DEFAULT_CONFIG.emitDirs` is mutated.

Then change `packages/cli/src/config.ts:119-122` from the shallow spread to nested cloning:

```typescript
  const config: Config = {
    ...DEFAULT_CONFIG,
    emitDirs: { ...DEFAULT_CONFIG.emitDirs },
    rootDirs: [...DEFAULT_CONFIG.rootDirs],
    ...parsed,
    emitDirs: parsed.emitDirs && typeof parsed.emitDirs === "object"
      ? { ...(parsed.emitDirs as Record<string, string>) }
      : { ...DEFAULT_CONFIG.emitDirs },
    rootDirs: Array.isArray(parsed.rootDirs)
      ? [...(parsed.rootDirs as string[])]
      : [...DEFAULT_CONFIG.rootDirs],
  } as Config;
```

Run: `bun test --cwd packages/cli tests/unit/config.test.ts`
Expected: PASS; both cwd routes are independent and `DEFAULT_CONFIG` remains relative and unchanged.

Run: `bun test --cwd packages/cli`
Expected: PASS, 0 failures. If `packages/cli/tests/unit/config.test.ts` asserts the exact shape of `DEFAULT_CONFIG.emitDirs`, update that assertion to include the two new routes.

- [ ] **Step 13: Commit**

```bash
git add packages/cli/src/import.ts packages/cli/src/emit.ts packages/cli/src/config.ts packages/cli/src/types.ts packages/cli/tests/unit/import.test.ts packages/cli/tests/unit/emit.test.ts packages/cli/tests/unit/config.test.ts
git commit -m "feat: later-root precedence, nested emission paths, default agent routes"
```

---

### Task 2: Unified plugin integration over CLI APIs

**Files:**
- Create: none
- Modify: `packages/opencode-plugin/src/index.ts:1-88`
- Modify: `packages/opencode-plugin/tests/plugin.test.ts:1-106`
- Delete: the `loadBundledDefaults` export and the test `recursively loads nested bundled defaults when nothing is emitted` (`packages/opencode-plugin/tests/plugin.test.ts:72-101`), plus the unused `originalDefaults` binding at line 106
- Test: `packages/opencode-plugin/tests/plugin.test.ts`

**Interfaces:**
- Consumes: `loadConfig() -> Promise<Config>`, `build(rootDirs: string[], storePath: string, project: string) -> Promise<void>`, `emitAll(storePath: string, emitDirs: Record<string, string>, config: Config, dryRun?: boolean) -> Promise<string[]>` from `@md-merger/cli` (all already exported by `packages/cli/src/api.ts`).
- Consumes: later-root-wins `build()` and nested emission paths produced by Task 1.
- Consumes: `PluginInput.directory: string` and the OpenCode `config(input) -> Promise<void>` hook contract from `@opencode-ai/plugin`.
- Produces: `createMdMergerPlugin(defaultsDir: string) -> Plugin`, a factory seam for controlled tests without extending `PluginInput`.
- Produces: `mdMergerPlugin: Plugin`, constructed with the installed package defaults directory and returning `{ config: (opencodeConfig: Record<string, unknown>) => Promise<void> }` or `{}` on failure.
- Produces: `discoverDefaultRoots(defaultsDir: string) -> Promise<string[]>` exported for direct unit assertions.

- [ ] **Step 1: Delete the obsolete raw-loader test and stale binding**

In `packages/opencode-plugin/tests/plugin.test.ts`, delete lines 72-101 (the entire `recursively loads nested bundled defaults when nothing is emitted` test) and delete line 106 (`const originalDefaults = process.env.MD_MERGER_DEFAULTS_DIR;`).

- [ ] **Step 2: Write the failing boundary tests**

Add these tests inside the existing `describe.serial("plugin initialization", ...)` block in `packages/opencode-plugin/tests/plugin.test.ts`:

```typescript
  it("discovers every immediate directory under defaults as an input root", async () => {
    const { discoverDefaultRoots } = await import("../src/index");
    const fixture = join(import.meta.dirname, "build", `roots-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(fixture, "agents"), { recursive: true });
    mkdirSync(join(fixture, "skills"), { recursive: true });
    writeFileSync(join(fixture, "notes.md"), "not a root");
    try {
      const roots = await discoverDefaultRoots(fixture);
      expect(roots).toEqual([join(fixture, "agents"), join(fixture, "skills")]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("injects concrete nested defaults and excludes abstract modules", async () => {
    const root = join(import.meta.dirname, "build", `defaults-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults");
    const projectAgents = join(root, "agents");
    const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(join(defaults, "agents", "base", "core"), { recursive: true });
    mkdirSync(projectAgents, { recursive: true });
    writeFileSync(
      join(defaults, "agents", "base", "BasePrimaryAgent.md"),
      "---\ntype: agent\nabstract: true\n---\n## Role\nInherited base body.",
    );
    writeFileSync(
      join(defaults, "agents", "base", "core", "plan-o-strator.md"),
      "---\ntype: agent\nextends: [base/BasePrimaryAgent]\nabstract: false\n---\n## Workflow\nConcrete orchestration body.",
    );
    writeFileSync(
      join(root, ".md-merger", "config.yaml"),
      `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\n  skill: ${join(root, "skills-out")}\nrootDirs:\n  - ${projectAgents}\n`,
    );
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const { createMdMergerPlugin } = await import("../src/index");
      const plugin = createMdMergerPlugin(defaults);
      const hooks = await plugin({ directory: root } as any);
      const opencodeConfig: Record<string, unknown> = {};
      await (hooks as any).config(opencodeConfig);
      const agents = opencodeConfig.agent as Record<string, { prompt: string }>;
      expect(agents["base/core/plan-o-strator"].prompt).toContain("Inherited base body.");
      expect(agents["base/core/plan-o-strator"].prompt).toContain("Concrete orchestration body.");
      expect(agents["base/BasePrimaryAgent"]).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets a concrete project agent extend a bundled abstract base", async () => {
    const root = join(import.meta.dirname, "build", `inherit-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults");
    const projectAgents = join(root, "agents");
    const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(join(defaults, "agents", "base"), { recursive: true });
    mkdirSync(join(projectAgents, "custom"), { recursive: true });
    writeFileSync(
      join(defaults, "agents", "base", "BaseAgent.md"),
      "---\ntype: agent\nabstract: true\n---\n## Role\nBundled inherited body.",
    );
    writeFileSync(
      join(projectAgents, "custom", "worker.md"),
      "---\ntype: agent\nextends: [base/BaseAgent]\nabstract: false\n---\n## Workflow\nProject concrete body.",
    );
    writeFileSync(
      join(root, ".md-merger", "config.yaml"),
      `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\nrootDirs:\n  - ${projectAgents}\n`,
    );
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const { createMdMergerPlugin } = await import("../src/index");
      const hooks = await createMdMergerPlugin(defaults)({ directory: root } as any);
      const opencodeConfig: Record<string, unknown> = {};
      await (hooks as any).config(opencodeConfig);
      const prompt = (opencodeConfig.agent as any)["custom/worker"].prompt;
      expect(prompt).toContain("Bundled inherited body.");
      expect(prompt).toContain("Project concrete body.");
      expect((opencodeConfig.agent as any)["base/BaseAgent"]).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets project modules override same-path defaults and skips abstract project modules", async () => {
    const root = join(import.meta.dirname, "build", `override-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults");
    const projectAgents = join(root, "agents");
    const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(join(defaults, "agents", "shared"), { recursive: true });
    mkdirSync(join(projectAgents, "shared"), { recursive: true });
    writeFileSync(
      join(defaults, "agents", "shared", "reviewer.md"),
      "---\ntype: agent\nabstract: false\n---\n## Role\nBundled reviewer body.",
    );
    writeFileSync(
      join(projectAgents, "shared", "reviewer.md"),
      "---\ntype: agent\nabstract: false\n---\n## Role\nProject reviewer body.",
    );
    writeFileSync(
      join(projectAgents, "hidden.md"),
      "---\ntype: agent\nabstract: true\n---\n## Role\nHidden project body.",
    );
    writeFileSync(
      join(root, ".md-merger", "config.yaml"),
      `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\nrootDirs:\n  - ${projectAgents}\n`,
    );
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const { createMdMergerPlugin } = await import("../src/index");
      const hooks = await createMdMergerPlugin(defaults)({ directory: root } as any);
      const opencodeConfig: Record<string, unknown> = { agent: { "shared/reviewer": { prompt: "pre-existing" } } };
      await (hooks as any).config(opencodeConfig);
      const agents = opencodeConfig.agent as Record<string, { prompt: string }>;
      expect(agents["shared/reviewer"].prompt).toContain("Project reviewer body.");
      expect(agents["shared/reviewer"].prompt).not.toContain("Bundled reviewer body.");
      expect(agents["shared/reviewer"].prompt).not.toBe("pre-existing");
      expect(agents["hidden"]).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("emits into default .opencode routes when no user config exists", async () => {
    const root = join(import.meta.dirname, "build", `noconfig-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults");
    mkdirSync(join(defaults, "agents"), { recursive: true });
    mkdirSync(join(defaults, "skills"), { recursive: true });
    mkdirSync(join(root, ".md-merger", "agents-root", "input"), { recursive: true });
    writeFileSync(
      join(defaults, "agents", "solo.md"),
      "---\ntype: agent\nabstract: false\n---\n## Role\nDefault route body.",
    );
    writeFileSync(
      join(defaults, "skills", "helper.md"),
      "---\ntype: skill\nabstract: false\n---\n## Role\nDefault skill body.",
    );
    delete process.env.MD_MERGER_CONFIG;
    try {
      const { createMdMergerPlugin } = await import("../src/index");
      const hooks = await createMdMergerPlugin(defaults)({ directory: root } as any);
      const opencodeConfig: Record<string, unknown> = {};
      await (hooks as any).config(opencodeConfig);
      const agents = opencodeConfig.agent as Record<string, { prompt: string }>;
      expect(agents["solo"].prompt).toContain("Default route body.");
      expect(existsSync(join(root, ".opencode", "agents", "solo.md"))).toBe(true);
      expect(existsSync(join(root, ".opencode", "skills", "helper.md"))).toBe(true);
      expect(agents["helper"]).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not export a raw bundled-default loader", async () => {
    const plugin = await import("../src/index");
    expect((plugin as Record<string, unknown>).loadBundledDefaults).toBeUndefined();
  });

  it("preserves non-agent emitDirs routes and only injects agent output", async () => {
    const root = join(import.meta.dirname, "build", `routes-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults");
    const projectAgents = join(root, "agents");
    const agentOut = join(root, "agent-out");
    const skillOut = join(root, "skill-out");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(join(defaults, "agents"), { recursive: true });
    mkdirSync(projectAgents, { recursive: true });
    writeFileSync(
      join(projectAgents, "worker.md"),
      "---\ntype: agent\nabstract: false\n---\n## Role\nAgent body.",
    );
    writeFileSync(
      join(projectAgents, "helper.md"),
      "---\ntype: skill\nabstract: false\n---\n## Role\nSkill body.",
    );
    writeFileSync(
      join(root, ".md-merger", "config.yaml"),
      `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${agentOut}\n  skill: ${skillOut}\nrootDirs:\n  - ${projectAgents}\n`,
    );
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const { createMdMergerPlugin } = await import("../src/index");
      const hooks = await createMdMergerPlugin(defaults)({ directory: root } as any);
      const opencodeConfig: Record<string, unknown> = {};
      const hookResult = await (hooks as any).config(opencodeConfig);
      const agents = opencodeConfig.agent as Record<string, { prompt: string }>;
      expect(hookResult).toBeUndefined();
      expect(agents["worker"].prompt).toContain("Agent body.");
      expect(agents["helper"]).toBeUndefined();
      expect(existsSync(join(skillOut, "helper.md"))).toBe(true);
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores cwd and MD_MERGER_CONFIG when initialization fails", async () => {
    const root = join(import.meta.dirname, "build", `failure-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(defaults, { recursive: true });
    const configPath = join(root, ".md-merger", "config.yaml");
    writeFileSync(
      configPath,
      `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${join(root, "out")}\nrootDirs:\n  - ${join(root, "missing-input-root")}\n`,
    );
    const cwdBefore = process.cwd();
    const configBefore = process.env.MD_MERGER_CONFIG;
    process.env.MD_MERGER_CONFIG = configPath;
    try {
      const { createMdMergerPlugin } = await import("../src/index");
      const hooks = await createMdMergerPlugin(defaults)({ directory: root } as any);
      expect(hooks).toEqual({});
      expect(process.cwd()).toBe(cwdBefore);
      expect(process.env.MD_MERGER_CONFIG).toBe(configPath);
    } finally {
      process.chdir(cwdBefore);
      if (configBefore === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = configBefore;
      rmSync(root, { recursive: true, force: true });
    }
  });
```

Add `existsSync` to the `node:fs` import at the top of the file.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test --cwd packages/opencode-plugin`
Expected: FAIL — `discoverDefaultRoots` is not exported, `loadBundledDefaults` is still exported, defaults are not injected through the CLI pipeline, and skill output is injected or missing.

- [ ] **Step 4: Rewrite the plugin as a pure CLI-API adapter**

Replace the entire contents of `packages/opencode-plugin/src/index.ts` with:

```typescript
import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { loadConfig, build, emitAll } from "@md-merger/cli";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
// Defaults are copied into the package by `just build-local` and `prepublishOnly`.
const packageDefaultsDir = join(moduleDir, "..", "defaults");

/**
 * Every immediate subdirectory of the plugin's defaults/ tree is an input root.
 * New default categories are picked up without code changes; files are ignored.
 */
export async function discoverDefaultRoots(defaultsDir: string): Promise<string[]> {
  if (!existsSync(defaultsDir)) return [];
  const entries = await readdir(defaultsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(defaultsDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function toAgentKey(agentRoot: string, emittedPath: string): string | undefined {
  const relativePath = relative(agentRoot, emittedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) return undefined;
  return relativePath.split(sep).join("/").replace(/\.md$/, "");
}

export function createMdMergerPlugin(defaultsDir: string): Plugin {
  return async (input: PluginInput) => {
    const previousCwd = process.cwd();
    try {
      if (input.directory) process.chdir(input.directory);

      // The user's cwd-resolved config is authoritative; we only prepend default roots.
      const config = await loadConfig();
      const defaultRoots = await discoverDefaultRoots(defaultsDir);
      const rootDirs = [...defaultRoots, ...config.rootDirs];

      await build(rootDirs, config.storeFile, config.project);
      const emittedPaths = await emitAll(config.storeFile, config.emitDirs, config, false);

      const agentRoot = config.emitDirs.agent;
      const agentPrompts = new Map<string, string>();

      if (agentRoot !== undefined) {
        const absoluteAgentRoot = resolve(agentRoot);
        for (const emittedPath of emittedPaths) {
          const key = toAgentKey(absoluteAgentRoot, resolve(emittedPath));
          if (key === undefined) continue;
          try {
            agentPrompts.set(key, await readFile(resolve(emittedPath), "utf-8"));
          } catch {
            console.warn(`[md-merger] Failed to read emitted agent: ${emittedPath}`);
          }
        }
      }

      return {
        config: async (opencodeConfig: Record<string, unknown>) => {
          if (agentPrompts.size === 0) return;
          if (opencodeConfig.agent === undefined) opencodeConfig.agent = {};
          const agentConfig = opencodeConfig.agent as Record<string, unknown>;
          for (const [key, prompt] of agentPrompts) {
            agentConfig[key] = { prompt };
          }
        },
      };
    } catch (err) {
      console.error("[md-merger] Plugin initialization failed:", err);
      return {};
    } finally {
      process.chdir(previousCwd);
    }
  };
}

export const mdMergerPlugin: Plugin = createMdMergerPlugin(packageDefaultsDir);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test --cwd packages/opencode-plugin`
Expected: PASS, 0 failures.

- [ ] **Step 6: Run the full workspace checks**

Run: `bun test`
Expected: PASS, 0 failures.

Run: `bun run typecheck`
Expected: exit code 0, no output from `tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add packages/opencode-plugin/src/index.ts packages/opencode-plugin/tests/plugin.test.ts
git commit -m "fix: route plugin defaults through the CLI build and emit pipeline"
```

---

### Task 3: Repository guidance and documentation consistency

**Files:**
- Create: `AGENTS.md`
- Modify: `README.md:233` and the README section listing root commands
- Delete: none
- Test: content review against the checklist in this task, plus `bun test` and `bun run typecheck` from Tasks 1 and 2

**Interfaces:**
- Consumes: the final precedence, routing, and emission behavior implemented in Tasks 1 and 2.
- Produces: `AGENTS.md` as the durable project-level instruction file for future agents.

- [ ] **Step 1: Create `AGENTS.md`**

Create `AGENTS.md` at the repository root with exactly this content:

```markdown
# Project Agent Instructions

## Architecture

- `packages/cli` owns all Markdown module processing: discovery, frontmatter parsing, store writes, inheritance resolution, abstract filtering, type routing, and merged emission. Do not duplicate parser, traversal, merge, or emission logic in any integration package.
- `packages/opencode-plugin` is restricted to OpenCode integration: it discovers bundled default roots, calls the CLI package's exported API, reads emitted agent output, and mutates OpenCode's supplied `agent` config.
- Integrations call exported CLI library functions directly. Do not invoke CLI commands or spawn subprocesses from an integration package.

## Module resolution

- Bundled plugin defaults are discovered dynamically from every immediate directory under the plugin package's `defaults/` directory. Do not hard-code `agents/` or `skills/`.
- Root directories are processed in order, defaults first and project roots second. When the same module path exists in more than one root, the later root wins.
- A module with `abstract: true` participates in inheritance but is never emitted and never registered as an agent or skill. This applies to bundled defaults and project files alike.
- A concrete module is emitted only after inheritance resolution.
- Output directories are selected by the module's `type` frontmatter field through `emitDirs.<type>`: `type: agent` uses `emitDirs.agent`, `type: skill` uses `emitDirs.skill`. Never infer an output directory from a source folder name.
- With no user configuration file, `type: agent` defaults to `.opencode/agents` and `type: skill` defaults to `.opencode/skills`, resolved against the working directory. A user configuration may replace these routes.
- Nested module paths are preserved in emitted directories and in OpenCode agent keys. `base/core/plan-o-strator` emits to `<emitDirs.agent>/base/core/plan-o-strator.md` and registers as `base/core/plan-o-strator`.
- Resolved module paths are assumed unique. Collision handling beyond the later-root override rule is deferred to a separate follow-up.
- A generated plugin agent replaces any existing OpenCode `agent` entry with the same key.

## Quality workflow

- Plugin tests must exercise the complete boundary: source roots through CLI build and emit, through the returned OpenCode config hook, to the mutated `agent` map.
- Generated defaults, stores, and emitted output must not be committed.
- Before declaring work complete, run the narrowest relevant checks, then cross-package validation when the change spans packages: `bun test --cwd packages/cli`, `bun test --cwd packages/opencode-plugin`, `bun test`, and `bun run typecheck`. Use `just` recipes for CLI workflows.
- For behavioral or multi-file changes, define acceptance cases and add or update focused `bun:test` coverage before implementation. Cover unit, pipeline, and integration-boundary behavior as applicable.
- Tests that alter `process.cwd()`, `MD_MERGER_CONFIG`, stores, or output directories must use unique temporary paths and restore state during cleanup, including failure paths.
- For cross-cutting or multi-session work, update the applicable spec, plan, or status artifact with decisions, affected files, validation evidence, known issues, and next actions. Do not create a status artifact for small isolated changes without a clear need.
- Cross-cutting CLI/plugin or inheritance changes require an independent review focused on correctness, compatibility, and regression coverage. Record findings with severity and file/line evidence.
- Parallel agents may explore or review independently. Writers must use separate worktrees or explicit non-overlapping file ownership, followed by reconciliation.
- Do not add runtime dependencies without documenting why existing Bun or Node APIs are insufficient and reviewing the dependency's security and supply-chain impact.

Apply validation, review, and parallelism proportionally to a change's scope and risk. This project does not require browser checks, MCP integrations, tracing, cost dashboards, evaluation sets, worktrees, or subagents for every change.
```

- [ ] **Step 2: Verify the required claims are present**

Run: `grep -c "later root wins" AGENTS.md`
Expected: `1`

Run: `grep -c "emitDirs" AGENTS.md`
Expected: a value of `4` or greater.

- [ ] **Step 3: Correct the stale README precedence claim**

In `README.md`, locate the line at or near line 233 stating that multiple root directories use first-match-wins precedence. Replace that sentence with:

```markdown
Multiple root directories are processed in order and later roots win: if the same module path exists in more than one root, the last root's definition overrides earlier ones.
```

- [ ] **Step 4: Correct the README command surface**

In the README section that lists root-level `bun run` equivalents, replace any claim of root scripts beyond those defined in root `package.json` with:

```markdown
Verified commands:

- `bun test` — run the full workspace test suite
- `bun run typecheck` — run `tsc --noEmit` across the workspace
- `bun test --cwd packages/cli` — run CLI package tests
- `bun test --cwd packages/opencode-plugin` — run plugin package tests
- `just build`, `just emit`, `just render`, `just doctor`, `just stats`, `just build-local` — CLI workflows
```

- [ ] **Step 5: Verify the README no longer contradicts the implementation**

Run: `grep -n "first match wins" README.md`
Expected: no output.

Run: `bun test`
Expected: PASS, 0 failures.

Run: `bun run typecheck`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: add project agent instructions and correct root precedence docs"
```

---

## Follow-Up (Not In Scope)

The plugin rebuilds defaults and project roots into the user's persistent configured store on every initialization. Under current append-only store semantics this grows the store over time. The user has confirmed this is acceptable for now and will be addressed by a separate, larger store rework.
