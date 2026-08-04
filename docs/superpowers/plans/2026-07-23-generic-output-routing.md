# Generic Output Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `type` frontmatter field and `emitDirs` config mapping so markdown files route to different output directories; de-agent-ize terminology across the codebase.

**Architecture:** Add `type?: string` to PromptRecord (extracted at import time). Replace `emitDir: string` on Config with `emitDirs: Record<string, string>`. Extend the YAML parser to handle one level of nested key-value objects. Emit layer looks up `record.type` in `emitDirs` to determine output path. Files without `type` or with unknown `type` are skipped. Frontmatter rendering strips `type` like it strips `extends`/`abstract`. Rename `resolvePrompt` → `resolve`, `renderPromptText` → `renderText`, and update all messages/help text from "agent/prompt" to "module/document".

**Tech Stack:** Bun, TypeScript, minimal dependencies (no external YAML library).

## Global Constraints

- Runtime: Bun (TypeScript)
- No external dependencies added — the YAML parser stays custom
- Existing `PromptRecord` and `Section` interface names remain unchanged
- `type` is tool metadata only — stripped from emitted frontmatter
- Files without `type` are silently skipped (not emitted)
- Files with `type` not in `emitDirs` get a warning to stderr, then skipped
- Test runner: `bun test`
- Type checker: `bun run typecheck` (tsc --noEmit)
- TDD: write failing test first, verify it fails, implement minimally, verify it passes

---

### Task 1: Types — add `type` to PromptRecord and `emitDirs` to Config

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: nothing (foundation task)
- Produces: `type?: string` on PromptRecord, `emitDirs: Record<string, string>` on Config, updated DEFAULT_CONFIG

- [ ] **Step 1: Write failing test in src/config.test.ts**

Add a test that expects `emitDirs` to be a Record:

```typescript
import { loadConfig } from "./config";

describe("loadConfig emitDirs", () => {
  test("emitDirs defaults to { default: 'output' }", async () => {
    const config = await loadConfig();
    expect(config.emitDirs).toBeDefined();
    expect(config.emitDirs.default).toBe("output");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/config.test.ts -t "emitDirs defaults"`
Expected: FAIL — `emitDirs` does not exist on Config yet

- [ ] **Step 3: Update types.ts**

Add `type?: string` to PromptRecord. Replace `emitDir: string` with `emitDirs: Record<string, string>` on Config. Update DEFAULT_CONFIG:

```typescript
export interface PromptRecord {
  id: string;
  name: string;
  version: number;
  sections: Section[];
  extends?: string[];
  type?: string;
  frontmatter: Record<string, unknown>;
  abstract: boolean;
  status: "draft" | "active";
  createdAt: string;
  updatedAt: string;
}

export interface Config {
  project: string;
  version: string;
  maxInheritDepth: number;
  storeFile: string;
  emitDirs: Record<string, string>;
  rootDirs: string[];
}

export const DEFAULT_CONFIG: Omit<Config, "project" | "version"> = {
  maxInheritDepth: DEFAULT_MAX_INHERIT_DEPTH,
  storeFile: "prompts.jsonl",
  emitDirs: { default: "output" },
  rootDirs: [".evo/agents-root/input"],
};
```

> Note: When patching an existing record, `type: undefined` in the patch will override the record's existing type. The import layer must guard against this by only including type in the update patch when it has a defined string value.

- [ ] **Step 4: Run typecheck to verify types compile**

Run: `bun run typecheck`
Expected: FAIL — config.ts and emit.ts still reference `emitDir` (expected, they haven't been updated yet)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add type field to PromptRecord, emitDirs to Config"
```

---

### Task 2: YAML Parser — nested object support for emitDirs

**Files:**
- Modify: `src/config.ts`

**Interfaces:**
- Consumes: `Config.emitDirs: Record<string, string>` from Task 1
- Produces: YAML parser that handles indented key-value pairs as nested objects

- [ ] **Step 1: Write failing test in src/config.test.ts**

Test that a config with indented key-value pairs under `emitDirs` parses correctly:

```typescript
import { loadConfig } from "./config";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

describe("loadConfig emitDirs parsing", () => {
  test("parses indented key-value pairs as nested object", async () => {
    const tmpDir = join(tmpdir(), "evo-emitdirs-test-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDir, "cfg.yaml");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(cfgPath, [
      `project: test`,
      `version: "1"`,
      `storeFile: ${join(tmpDir, "store.jsonl")}`,
      `emitDirs:`,
      `  skill: path/to/skill`,
      `  agent: path/to/agent`,
      `rootDirs:`,
      `  - ${tmpDir}/input`,
    ].join("\n"));

    const origEnv = process.env.EVO_CONFIG;
    try {
      process.env.EVO_CONFIG = cfgPath;
      const config = await loadConfig();
      expect(config.emitDirs.skill).toBe(join(tmpDir, "path/to/skill"));
      expect(config.emitDirs.agent).toBe(join(tmpDir, "path/to/agent"));
      expect(config.emitDirs.default).toBeUndefined();
    } finally {
      if (origEnv === undefined) delete process.env.EVO_CONFIG;
      else process.env.EVO_CONFIG = origEnv;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("warns when old emitDir format is detected", async () => {
    const tmpDir = join(tmpdir(), "evo-migrate-test-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDir, "cfg.yaml");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(cfgPath, [
      `project: test`,
      `version: "1"`,
      `storeFile: ${join(tmpDir, "store.jsonl")}`,
      `emitDir: legacy-output`,  // old format
      `rootDirs:`,
      `  - ${tmpDir}/input`,
    ].join("\n"));

    const origEnv = process.env.EVO_CONFIG;
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      process.env.EVO_CONFIG = cfgPath;
      await loadConfig();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("deprecated")
      );
    } finally {
      warnSpy.mockRestore();
      if (origEnv === undefined) delete process.env.EVO_CONFIG;
      else process.env.EVO_CONFIG = origEnv;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/config.test.ts -t "parses indented key-value"`
Expected: FAIL — parser doesn't handle nested objects yet

Run: `bun test src/config.test.ts -t "warns when old emitDir"`
Expected: FAIL — migration warning isn't implemented yet

- [ ] **Step 3: Extend the YAML parser in config.ts**

Add object collection mode alongside the existing array collection mode. Update `pendingKey` logic to track whether we're collecting an array or an object:

```typescript
export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();
  const resolvedPath = isAbsolute(configPath) || configPath.startsWith("http")
    ? configPath
    : join(process.cwd(), configPath);

  let parsed: Record<string, unknown> = {};

  try {
    const text = await Bun.file(resolvedPath).text();
    const lines = text.split("\n");

    let pendingKey: string | null = null;
    let pendingArray: string[] = [];
    let pendingObject: Record<string, string> | null = null;

    function flushPending(): void {
      if (pendingKey !== null) {
        if (pendingObject !== null) {
          parsed[pendingKey] = pendingObject;
          pendingObject = null;
        } else if (pendingArray.length > 0) {
          parsed[pendingKey] = pendingArray;
        }
        pendingKey = null;
        pendingArray = [];
      }
    }

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const indentLevel = rawLine.search(/\S/);

      // Indented lines — check BEFORE flush (handles both arrays and objects)
      if (indentLevel > 0 && pendingKey !== null) {
        // List item continuation (starts with - at indented level)
        if (trimmed.startsWith("- ")) {
          pendingArray.push(trimmed.slice(2).trim());
          continue;
        }

        // Indented key-value pair (nested object)
        const indentedKeyValue = trimmed.match(/^(\S+):\s*(.+)$/);
        if (indentedKeyValue) {
          if (pendingObject === null) {
            pendingObject = {};
          }
          pendingObject[indentedKeyValue[1]!] = indentedKeyValue[2]!.trim();
          continue;
        }
      }

      // Top-level key — flush pending before starting new key
      flushPending();

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      let valueStr = trimmed.slice(colonIdx + 1).trim();

      if (valueStr === "") {
        pendingKey = key;
        pendingArray = [];
        continue;
      }

      parsed[key] = parseYamlScalar(valueStr);
    }

    flushPending();

    // Migration warning: detect old emitDir format
    if (typeof parsed.emitDir === "string") {
      console.warn(
        "Config uses deprecated 'emitDir'. Replace with 'emitDirs: { default: <path> }'."
      );
    }
  } catch {
    // File may not exist; fall back to defaults
  }

  const config: Config = {
    ...DEFAULT_CONFIG,
    ...parsed,
  } as Config;

  if (!isAbsolute(config.storeFile)) config.storeFile = join(process.cwd(), config.storeFile);

  const emitDirs = config.emitDirs;
  for (const typeKey of Object.keys(emitDirs)) {
    if (!isAbsolute(emitDirs[typeKey])) {
      emitDirs[typeKey] = join(process.cwd(), emitDirs[typeKey]);
    }
  }

  config.rootDirs = config.rootDirs.map(d => isAbsolute(d) ? d : join(process.cwd(), d));

  return config;
}
```

Key changes:
- Indented line evaluation happens BEFORE flushPending, so all indented lines are consumed while in collection mode
- flushPending() is only called at top-level key boundaries
- Introduce `pendingObject` alongside `pendingArray`
- When indented `key: value` lines follow an empty-value key, detect and collect as nested object
- Replace `config.emitDir` path resolution with loop over `config.emitDirs` values
- `flushPending` handles both array and object modes
- Migration detection: warn if `parsed.emitDir` (old string format) is present, guiding users to new `emitDirs` syntax

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/config.test.ts -t "parses indented key-value"`
Expected: PASS

Run: `bun test src/config.test.ts -t "warns when old emitDir"`
Expected: PASS

- [ ] **Step 5: Run all config tests**

Run: `bun test src/config.test.ts`
Expected: PASS — existing tests should still work (they don't test emitDirs parsing directly)

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat(config): extend YAML parser for nested objects, resolve emitDirs paths"
```

---

### Task 3: Import — extract `type` from frontmatter

**Files:**
- Modify: `src/import.ts`
- Modify: `src/import.test.ts`

**Interfaces:**
- Consumes: `PromptRecord.type?: string` from Task 1
- Produces: `type` field populated on records during import

- [ ] **Step 1: Write failing test in src/import.test.ts**

```typescript
test("extracts type from frontmatter", async () => {
  writeFileSync(join(rootDir, "typed.md"), "---\ntype: skill\n---\n## Role\nHelper.");
  await build([rootDir], storePath, "test-project");
  const record = await findLatest(storePath, "typed");
  expect(record).toBeDefined();
  expect(record!.type).toBe("skill");
});

test("leaves type undefined when not in frontmatter", async () => {
  writeFileSync(join(rootDir, "notype.md"), "---\nname: NoType\n---\n## Role\nHelper.");
  await build([rootDir], storePath, "test-project");
  const record = await findLatest(storePath, "notype");
  expect(record).toBeDefined();
  expect(record!.type).toBeUndefined();
});
```

Also add a type-scalar parsing test to `src/frontmatter.test.ts`:

```typescript
test("parses type field as string scalar", () => {
  const content = "---\ntype: skill\n---\n## Role\nBody";
  const { metadata } = extractFrontmatter(content);
  expect(metadata.type).toBe("skill");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/import.test.ts -t "extracts type"`
Expected: FAIL — type is not yet extracted

- [ ] **Step 3: Update import.ts to extract type**

Add `type` extraction alongside `extends` and `abstract`:

```typescript
// Inside the for loop, after abstractBool line:
// Guard against empty strings to prevent confusing warnings during emit
const typeValue = typeof metadata.type === "string" && metadata.type.length > 0
  ? (metadata.type as string).trim()
  : undefined;
```

Then build the patch conditionally to avoid erasing type on re-import:

```typescript
// Inside the for loop, after abstractBool line:
// Guard against empty strings to prevent confusing warnings during emit
const typeValue = typeof metadata.type === "string" && metadata.type.length > 0
  ? (metadata.type as string).trim()
  : undefined;

// Build the patch object — for updates, only include type if it has a value
// to avoid erasing the existing record's type on re-import
const patch = {
  sections,
  frontmatter: metadata,
  extends: extendsArr,
  abstract: abstractBool,
} as Partial<PromptRecord>;

if (typeValue !== undefined) {
  patch.type = typeValue;
}

if (existing) {
  await updateOrCreate(storePath, modulePath, project, patch);
} else {
  await updateOrCreate(storePath, modulePath, project, {
    ...patch,
    type: typeValue, // on creation, type is simply set (or omitted if undefined)
    status: "active",
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/import.test.ts -t "extracts type"`
Run: `bun test src/import.test.ts -t "leaves type undefined"`
Expected: PASS

- [ ] **Step 5: Run all import tests**

Run: `bun test src/import.test.ts`
Expected: PASS — existing tests still pass (they don't assert on type)

- [ ] **Step 6: Commit**

```bash
git add src/import.ts src/import.test.ts
git commit -m "feat(import): extract type field from frontmatter during build"
```

---

### Task 4: Frontmatter Rendering — strip `type` and rename emit functions

**Files:**
- Modify: `src/emit.ts`
- Modify: `src/frontmatter.ts`
- Modify: `src/frontmatter.test.ts`

**Interfaces:**
- Consumes: `type?: string` on PromptRecord from Task 1
- Produces: `type` stripped from output frontmatter; `renderPromptText` → `renderText` with `type` stripped

- [ ] **Step 1: Write failing test in src/emit.test.ts**

```typescript
test("strips type from output frontmatter", async () => {
  await updateOrCreate(storePath, "typed-base", "test", {
    type: "skill",
    sections: [{ name: "role", body: "You are helpful." }],
    frontmatter: { name: "Typed Agent", type: "skill" },
    abstract: false,
  });
  const output = await renderText(storePath, "typed-base", 5);
  expect(output).not.toContain("type:");
  expect(output).toContain("## Role");
});
```

Note: this test will initially fail because `renderText` doesn't exist yet (it's called `renderPromptText`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/emit.test.ts -t "strips type"`
Expected: FAIL — function renamed and type not stripped yet

- [ ] **Step 3: Rename renderPromptText to renderText and strip type**

In `src/emit.ts`, rename the function and add `delete fm.type`:

```typescript
export async function renderText(
  storePath: string,
  name: string,
  maxDepth: number,
): Promise<string> {
  const result = await resolve(storePath, name, maxDepth);
  const fm = { ...result.frontmatter };
  delete fm.extends;
  delete fm.abstract;
  delete fm.type;
  // ... rest unchanged
```

Also update the JSDoc comment block above the function. Since Step 4.5 in Task 5 will do a broader terminology sweep, leave any remaining "prompt"/"agent" words in this JSDoc for Task 5 to catch — just rename the function reference from `renderPromptText` to `renderText` here.

- [ ] **Step 4: Strip `type` from renderMarkdown in frontmatter.ts**

Update the filter in `renderMarkdown`:

```typescript
const relevantKeys = Object.keys(frontmatter).filter(
  (k) => k !== "extends" && k !== "abstract" && k !== "type",
);
```

- [ ] **Step 4.5: Add renderMarkdown type-stripping test to frontmatter.test.ts**

```typescript
test("strips type from rendered frontmatter", () => {
  const result = renderMarkdown(
    { name: "Test", type: "skill" },
    [{ name: "role", body: "Helper" }]
  );
  expect(result).not.toContain("type:");
  expect(result).toContain("name: Test");
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/emit.test.ts -t "strips type"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/emit.ts src/frontmatter.ts
git commit -m "feat(emit): strip type from output frontmatter, rename renderText"
```

---

### Task 5: Resolve — rename resolvePrompt to resolve, terminology updates

**Files:**
- Modify: `src/resolve.ts`
- Modify: `src/resolve.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is a rename + text change task)
- Produces: `resolve` function name, "Module not found" error message

- [ ] **Step 1: Rename resolvePrompt to resolve in resolve.ts**

Update function name and JSDoc comments:

```typescript
export async function resolve(
  storePath: string,
  name: string,
  maxDepth: number,
  depth: number = 0,
  visited?: Set<string>,
): Promise<RenderResult> {
```

Update the recursive call and comment:
- "Find prompt by name" → "Find module by name"
- "Merge focal prompt's sections" → "Merge focal module's sections"
- `throw new Error("Prompt "${name}" not found")` → `throw new Error("Module "${name}" not found")`
- IMPORTANT: Also update the recursive self-call within the function body (around line 139 of the current resolve.ts) from `resolvePrompt(...)` to `resolve(...)`.

- [ ] **Step 2: Update import references in emit.ts**

```typescript
// Change from:
import { resolvePrompt, topologicalSort } from "./resolve";
// To:
import { resolve, topologicalSort } from "./resolve";
```

And update all calls:
```typescript
// Change from:
const result = await resolvePrompt(storePath, name, maxDepth);
// To:
const result = await resolve(storePath, name, maxDepth);
```

Also update `emitAll` to pass `emitDirs` instead of `emitDir`:

```typescript
export async function emitAll(
  storePath: string,
  emitDirs: Record<string, string>,
  config: Config,
  dryRun: boolean = false,
): Promise<string[]> {
```

- [ ] **Step 3: Update emit.ts terminology and routing logic**

In `emitAll`, update the emit loop to route by type:

```typescript
for (const name of sortedNames) {
  const record = recordMap.get(name);
  if (!record) continue;

  if (record.abstract) {
    continue;
  }

  if (!record.type) {
    continue;
  }

  const targetDir = emitDirs[record.type];
  if (!targetDir) {
    console.error(`No emit dir configured for type "${record.type}" in module "${name}", skipping`);
    continue;
  }

  let text: string;
  try {
    text = await renderText(storePath, name, config.maxInheritDepth);
  } catch (err) {
    console.error(`Failed to render "${name}": ${err instanceof Error ? err.message : String(err)}`);
    failedModules.push(name);
    continue;
  }

  const safeName = name.replace(/\//g, "_");
  const filePath = `${targetDir}/${safeName}.md`;
  // ... dryRun or write, same as before
}
```

Also rename `failedAgents` → `failedModules` and update the failure message. Update the console.error failure report at the bottom of `emitAll` (around line 159-163) to use generic terminology:

```typescript
if (failedModules.length > 0) {
  console.error(
    `\nFailed to render ${failedModules.length} module(s): ${failedModules.join(", ")}`
  );
}
```

- [ ] **Step 4: Update JSDoc comments in resolve.ts**

Replace "prompt" with "module" in comments:
- "Topologically sort all prompts" → "Topologically sort all modules"
- "Recursively resolve a prompt" → "Recursively resolve a module"
- "focal prompt" → "focal module"
- "Returns a list of prompt names where parents always appear before their dependents." → "Returns a list of module names where parents always appear before their dependents."

- [ ] **Step 4.5: Update JSDoc comments in emit.ts**

Update all agent/prompt terminology in the JSDoc blocks in emit.ts:
- "Render a resolved agent as a markdown string" → "Render a resolved module as a markdown string"
- "Resolve the prompt (with inheritance) via resolvePrompt" → "Resolve the module (with inheritance) via resolve"
- "Emit all resolved agents as markdown files" → "Emit all resolved modules as markdown files"
- "For each agent in topological order (skipping abstract)" → "For each module in topological order (skipping abstract)"
- "if renderPromptText fails for one agent" → "if renderText fails for one module"
- "continue processing remaining agents" → "continue processing remaining modules"

- [ ] **Step 4.6: Update resolve.test.ts for rename and terminology**

Update `src/resolve.test.ts`:
1. Change import from `import { mergeSections, resolvePrompt, topologicalSort } from "./resolve"` to `import { mergeSections, resolve, topologicalSort } from "./resolve"`
2. Rename the describe block from `"resolvePrompt"` to `"resolve"`
3. Replace all `resolvePrompt(...)` calls with `resolve(...)` — there are 8+ occurrences
4. Update test names from "agent" terminology to "module" terminology (e.g., "resolves leaf agent" → "resolves leaf module")

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (or only index.ts errors from not yet updated imports)

- [ ] **Step 6: Commit**

```bash
git add src/resolve.ts src/resolve.test.ts src/emit.ts src/frontmatter.ts
git commit -m "refactor: rename resolvePrompt to resolve, route emit by type, update terminology"
```

---

### Task 6: CLI Entry Point — update index.ts for emitDirs and terminology

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: renamed `renderText` from Task 4, renamed `resolve` from Task 5, new `emitDirs` from Task 2, updated `emitAll` signature from Task 5
- Produces: working CLI with `emitDirs` routing, generic terminology

- [ ] **Step 1: Update index.ts import references**

```typescript
// Change from:
import { emitAll, renderPromptText } from "./emit";
// To:
import { emitAll, renderText } from "./emit";
```

- [ ] **Step 2: Update emit command handler**

```typescript
case "emit": {
  const dryRun = args[1] === "--dry-run";
  const paths = await emitAll(storePath, config.emitDirs, config, dryRun);
  if (dryRun) {
    console.log(`${paths.length} file(s) would be written`);
  } else {
    console.log(`Emitted ${paths.length} file(s)`);
  }
  break;
}
```

- [ ] **Step 3: Update render command handler**

```typescript
case "render": {
  const name = args[1];
  if (!name) {
    console.error("Usage: evo render <module>");
    process.exit(1);
  }
  console.log(await renderText(storePath, name, config.maxInheritDepth));
  break;
}
```

- [ ] **Step 4: Update help text**

```typescript
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
```

- [ ] **Step 5: Update stats command terminology**

```typescript
console.log(`Total: ${records.length}, Abstract: ${abstract}, Leaves: ${leaves}`);
```

(Stats message is already generic, no change needed.)

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/index.ts
git commit -m "feat(cli): update emit command for emitDirs routing, generic help text"
```

---

### Task 7: Update All Tests — emit tests, terminology, new test cases

**Files:**
- Modify: `src/emit.test.ts`
- Modify: `src/config.test.ts` (already partially updated in Task 2)

**Interfaces:**
- Consumes: all prior changes
- Produces: passing test suite

- [ ] **Step 1: Update emit.test.ts — rename renderPromptText references to renderText**

Replace all `renderPromptText` with `renderText`. Update import:

```typescript
import { emitAll, renderText } from "./emit";
```

- [ ] **Step 2: Update emit.test.ts Config fixture**

Replace `emitDir` with `emitDirs` in test config objects:

```typescript
const config: Config = {
  project: "test",
  version: "1",
  maxInheritDepth: 5,
  storeFile: "store.jsonl",
  emitDirs: { agent: emitDir },
  rootDirs: [],
};
```

- [ ] **Step 3: Add type field to test records that expect emission**

Records in `emitAll` test need `type: "agent"` so they route:

```typescript
test("writes merged markdown files", async () => {
  await updateOrCreate(storePath, "base", "test", {
    sections: [{ name: "role", body: "You are helpful." }],
    frontmatter: { name: "Base" },
    status: "active" as const,
    abstract: false,
    type: "agent",
  });
  // ... rest of test
});
```

- [ ] **Step 4a: Add new emit tests for type routing**

```typescript
test("routes modules by type to correct emit dir", async () => {
  const skillDir = join(testDir, "skills");
  const agentDir = join(testDir, "agents");

  await updateOrCreate(storePath, "skill-mod", "test", {
    sections: [{ name: "role", body: "Skill module." }],
    frontmatter: {},
    status: "active" as const,
    abstract: false,
    type: "skill",
  });

  await updateOrCreate(storePath, "agent-mod", "test", {
    sections: [{ name: "role", body: "Agent module." }],
    frontmatter: {},
    status: "active" as const,
    abstract: false,
    type: "agent",
  });

  const config: Config = {
    project: "test",
    version: "1",
    maxInheritDepth: 5,
    storeFile: "store.jsonl",
    emitDirs: { skill: skillDir, agent: agentDir },
    rootDirs: [],
  };

  const paths = await emitAll(storePath, config.emitDirs, config, false);
  expect(readFileSync(join(skillDir, "skill-mod.md"), "utf-8")).toContain("## Role");
  expect(readFileSync(join(agentDir, "agent-mod.md"), "utf-8")).toContain("## Role");
});

test("skips modules without type", async () => {
  await updateOrCreate(storePath, "no-type-mod", "test", {
    sections: [{ name: "role", body: "No type." }],
    frontmatter: {},
    status: "active" as const,
    abstract: false,
  });

  const config: Config = {
    project: "test",
    version: "1",
    maxInheritDepth: 5,
    storeFile: "store.jsonl",
    emitDirs: { agent: join(testDir, "agentout") },
    rootDirs: [],
  };

  const paths = await emitAll(storePath, config.emitDirs, config, false);
  expect(paths.length).toBe(0);
});

test("warns and skips modules with unknown type", async () => {
  await updateOrCreate(storePath, "unknown-type-mod", "test", {
    sections: [{ name: "role", body: "Unknown type." }],
    frontmatter: {},
    status: "active" as const,
    abstract: false,
    type: "widget",
  });

  const config: Config = {
    project: "test",
    version: "1",
    maxInheritDepth: 5,
    storeFile: "store.jsonl",
    emitDirs: { agent: join(testDir, "agentout") },
    rootDirs: [],
  };

  const stderrSpy = spyOn(console, "error").mockImplementation(() => {});
  const paths = await emitAll(storePath, config.emitDirs, config, false);
  expect(paths.length).toBe(0);
  expect(stderrSpy).toHaveBeenCalledWith(
    expect.stringContaining("No emit dir configured for type \"widget\"")
  );
  stderrSpy.mockRestore();
});
```

Note: Use Bun's built-in `spyOn` (not `jest.spyOn`). Bun test provides `spyOn` globally.

- [ ] **Step 4.5: Add additional emit tests (abstract skip, type persistence, multi-emitDirs resolution)**

Add these tests to `src/emit.test.ts` (first two) and `src/config.test.ts` (third):

```typescript
// In src/emit.test.ts:
test("skips abstract module even when type is present", async () => {
  await updateOrCreate(storePath, "abstract-typed", "test", {
    sections: [{ name: "role", body: "Abstract typed." }],
    frontmatter: {},
    status: "active" as const,
    abstract: true,
    type: "agent",
  });

  const config: Config = {
    project: "test",
    version: "1",
    maxInheritDepth: 5,
    storeFile: "store.jsonl",
    emitDirs: { agent: join(testDir, "agentout") },
    rootDirs: [],
  };

  const paths = await emitAll(storePath, config.emitDirs, config, false);
  expect(paths.length).toBe(0);
});

test("preserves type field across update builds", async () => {
  // First build — create with type
  await updateOrCreate(storePath, "persist-type", "test", {
    sections: [{ name: "role", body: "Initial." }],
    frontmatter: { type: "skill" },
    status: "active" as const,
    abstract: false,
    type: "skill",
  });

  // Second build — update sections but keep same type in frontmatter
  await updateOrCreate(storePath, "persist-type", "test", {
    sections: [{ name: "role", body: "Updated." }],
    frontmatter: { type: "skill" },
    status: "active" as const,
    abstract: false,
    type: "skill",
  });

  const record = await findLatest(storePath, "persist-type");
  expect(record?.type).toBe("skill");
});

test("preserves existing type when re-import omits type from frontmatter", async () => {
  // First import — create with type
  await updateOrCreate(storePath, "preserve-type", "test", {
    sections: [{ name: "role", body: "Initial." }],
    frontmatter: { type: "skill" },
    status: "active" as const,
    abstract: false,
    type: "skill",
  });

  // Second import — update with type: undefined (frontmatter had no type)
  await updateOrCreate(storePath, "preserve-type", "test", {
    sections: [{ name: "role", body: "Updated." }],
    frontmatter: {},
    extends: undefined,
    abstract: false,
    // type intentionally omitted from patch
  });

  const record = await findLatest(storePath, "preserve-type");
  expect(record?.type).toBe("skill"); // type should be preserved
});

// In src/config.test.ts:
test("resolves multiple emitDirs keys to absolute paths", async () => {
  const tmpDirBase = join(tmpdir(), "evo-multi-emit-" + Math.random().toString(36).slice(2));
  const cfgPath = join(tmpDirBase, "cfg.yaml");
  mkdirSync(tmpDirBase, { recursive: true });
  mkdirSync(join(tmpDirBase, "input"), { recursive: true });
  writeFileSync(cfgPath, [
    `project: test`,
    `version: "1"`,
    `storeFile: ${join(tmpDirBase, "store.jsonl")}`,
    `emitDirs:`,
    `  skill: skills-out`,
    `  agent: agents-out`,
    `rootDirs:`,
    `  - input`,
  ].join("\n"));

  const origEnv = process.env.EVO_CONFIG;
  const origCwd = process.cwd();
  try {
    process.env.EVO_CONFIG = cfgPath;
    process.chdir(tmpDirBase);
    const config = await loadConfig();
    expect(config.emitDirs.skill).toBe(join(tmpDirBase, "skills-out"));
    expect(config.emitDirs.agent).toBe(join(tmpDirBase, "agents-out"));
  } finally {
    process.chdir(origCwd);
    if (origEnv === undefined) delete process.env.EVO_CONFIG;
    else process.env.EVO_CONFIG = origEnv;
    rmSync(tmpDirBase, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4.6: Add integration test through build() pipeline for type persistence**

The existing type-persistence tests in Step 4.5 call `updateOrCreate` directly, which bypasses the actual import pipeline (`build()` → `extractFrontmatter()` → patch). Add this integration test to `src/import.test.ts` to verify the full pipeline preserves types:

```typescript
test("preserves type across rebuild when frontmatter omits type", async () => {
  // First build — create with type in frontmatter
  writeFileSync(join(rootDir, "persist-integration.md"), "---\ntype: skill\nname: PersistIntegration\n---\n## Role\nInitial.");
  await build([rootDir], storePath, "test-project");
  let record = await findLatest(storePath, "persist-integration");
  expect(record?.type).toBe("skill");

  // Modify the file to remove type from frontmatter
  writeFileSync(join(rootDir, "persist-integration.md"), "---\nname: PersistIntegration\n---\n## Role\nUpdated body.");
  await build([rootDir], storePath, "test-project");
  record = await findLatest(storePath, "persist-integration");
  expect(record?.type).toBe("skill"); // type should survive the rebuild
  expect(record?.sections[0]?.body).toBe("Updated body.");
});
```

- [ ] **Step 5: Update config.test.ts CWD resolution test**

The test at line 46-56 checks `config.emitDir`. Update to check `config.emitDirs`:

```typescript
test("resolves relative paths against process.cwd()", async () => {
  const config = await loadConfig();
  expect(config.storeFile).toMatch(process.cwd());
  for (const dir of Object.values(config.emitDirs)) {
    expect(dir).toMatch(process.cwd());
  }
  for (const dir of config.rootDirs) {
    expect(dir).toMatch(process.cwd());
  }
});
```

- [ ] **Step 5.5: Update "passes absolute paths through unchanged" test**

Update the existing "passes absolute paths through unchanged" test in `config.test.ts` to use `emitDirs` instead of `emitDir`:
- Replace `expect(config.emitDir).toBe(tmpDir)` with `expect(config.emitDirs.default).toBe(tmpDir)`
- Update the test's config YAML fixture to write:
  ```
  emitDirs:\n  default: ${tmpDir}
  ```
  instead of `emitDir: ${tmpDir}`

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: PASS

- [ ] **Step 7: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/emit.test.ts src/config.test.ts
git commit -m "test: update all tests for emitDirs routing and type field"
```

---

### Task 8: Update Justfile and CLI Comments

**Files:**
- Modify: `Justfile`

**Interfaces:**
- Consumes: nothing new
- Produces: updated Justfile comments for generic terminology

- [ ] **Step 1: Update Justfile comments**

Replace ALL "agent" references throughout the entire Justfile with generic terminology. Every line below needs updating:

**Header comments (lines 1-18):**
- Line 1: `# Justfile for evo-ai — agent prompt management with inheritance` → `# Justfile for evo-ai — markdown file processing with inheritance`
- Line 5: `#   2. Create .md agent files in your rootDirs` → `#   2. Create .md files with type and extends in frontmatter`
- Line 6: `#   3. Run: just build          # import agents into store` → `#   3. Run: just build          # import modules into store`
- Line 10: `#   Agent .md files can extend other agents via frontmatter:` → `#   Module .md files can extend other modules via frontmatter:`

**Recipe body comments (lines 23-41):**
- Line 23: `# Import agent .md files from rootDirs into the JSONL store` → `# Import .md files from rootDirs into the JSONL store`
- Line 27: `# Emit merged agent .md files (--dry-run to preview)` → `# Emit merged .md files (--dry-run to preview)`
- Line 31: `# Render and print a single agent with inheritance resolved` → `# Render and print a single module with inheritance resolved`
- Line 39: `# Show agent counts: total, abstract, and leaf agents` → `# Show module counts: total, abstract, and leaf modules`

```justfile
# Justfile for evo-ai — markdown file processing with inheritance
#
# Setup:
#   1. Create .evo/config.yaml with your project config
#   2. Create .md files with type and extends in frontmatter
#   3. Run: just build          # import modules into store
#   4. Run: just emit           # generate merged output files
#
# Inheritance:
#   Module .md files can extend other modules via frontmatter:
#     ---
#     extends: [system-base, traits/caution]
#     abstract: false
#     type: agent
#     ---
#   Child sections override parent sections by name.

# Import .md files from rootDirs into the JSONL store
build:
	bun ./src/index.ts build

# Emit merged .md files (--dry-run to preview)
emit *args:
	bun ./src/index.ts emit {{args}}

# Render and print a single module with inheritance resolved
render args:
	bun ./src/index.ts render {{args}}

# Validate references and detect circular dependencies
doctor:
	bun ./src/index.ts doctor

# Show module counts: total, abstract, and leaf modules
stats:
	bun ./src/index.ts stats
```

- [ ] **Step 2: Commit**

```bash
git add Justfile
git commit -m "docs: de-agent-ize Justfile comments"
```

---

### Task 9: Update Project Config File

**Files:**
- Modify: `.evo/config.yaml`

**Interfaces:**
- Consumes: new `emitDirs` config shape
- Produces: working project config for local development

- [ ] **Step 1: Update .evo/config.yaml to use emitDirs**

```yaml
project: evo-ai
version: "1"
maxInheritDepth: 5
storeFile: .evo/agents-root/prompts.jsonl
emitDirs:
  default: .evo/agents-root/output
rootDirs:
  - .evo/agents-root/input
```

- [ ] **Step 2: Commit**

```bash
git add .evo/config.yaml
git commit -m "chore: update project config for emitDirs format"
```

---

### Task 10: Final Verification

**Files:** no new files

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: all tests pass

- [ ] **Step 1.5: Verify migration path for existing records**

Existing store records lack the `type` field. After this change, they will be silently skipped during emit until re-imported. Verify that running `bun src/index.ts build` repopulates the `type` field from frontmatter:
Run: `bun src/index.ts build && bun src/index.ts emit --dry-run`
Expected: Previously imported files without type in their original frontmatter are silently skipped. Files that have `type` in their markdown frontmatter are properly emitted.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS, no errors

- [ ] **Step 3: Smoke test the CLI**

Run: `bun src/index.ts help`
Expected: prints updated help text with generic terminology

Run: `bun src/index.ts config show`
Expected: prints config with `emitDirs` field

- [ ] **Step 4: Verify no old terminology remains**

Search codebase for remaining "agent" references in comments and user-facing strings (excluding `PromptRecord` name, file paths, and the `.evo/agents-root` directory name which is data, not code):

```bash
rg "agent" src/ --type ts
```

Expected: only in variable names like `agentDir` in tests (acceptable) or the `.evo/agents-root` path string

- [ ] **Step 5: Commit any final fixes**

If any issues found in steps 1-4, fix and commit. If all pass, no additional commit needed.

---

## Self-Review Notes

**Spec coverage check:**
- [x] `type` as first-class field on PromptRecord — Task 1 + Task 3
- [x] Files without `type` skipped — Task 5 (emit loop)
- [x] `type` stripped from output frontmatter — Task 4
- [x] Unknown `emitDirs` key → warning + skip — Task 5
- [x] Abstract still skipped — Task 5 (unchanged behavior)
- [x] YAML parser nested object support — Task 2
- [x] `emitDirs` replaces `emitDir` — Task 1 + Task 2
- [x] Terminology changes (resolvePrompt→resolve, renderPromptText→renderText, help text) — Task 4 + Task 5 + Task 6
- [x] Tests updated — Task 7
- [x] Config file updated — Task 9

**Placeholder scan:** No TBDs, no "implement later", no vague instructions. Every step has concrete code or commands.

**Type consistency:** `emitDirs: Record<string, string>` used consistently. `type?: string` matches between PromptRecord and Config. Function rename cascade: resolvePrompt→resolve, renderPromptText→renderText propagated through all callers (index.ts, emit.ts tests).
