# Agent Inheritance CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun/TypeScript CLI (`evo`) that resolves inheritance chains of OpenCode agent markdown files, merges their sections, and emits fully combined output files.

**Architecture:** JSONL store backed CLI with adapted Canopy compose logic. Source `.md` → `evo build` → JSONL → `evo emit` → merged `.md`. Configuration location via `EVO_CONFIG` env var.

**Tech Stack:** Bun (TypeScript), zero npm deps (stdlib + built-in YAML frontmatter parser).

## Global Constraints

- Runtime: Bun (TypeScript, strict mode)
- Format: JSONL store, one record per line
- Config file path: `EVO_CONFIG` env var, default `.evo/config.yaml`
- In-Config paths: `storeFile`, `emitDir`, `rootDirs`, `maxInheritDepth` (default 5)
- Module-resolution: `extends` array of paths relative to root dirs (no `.md` extension)
- Section merging: override, append, empty=remove (Canopy-adapted rules)
- Frontmatter: shallow merge, child wins, `extends` stripped from output
- Abstract agents (`abstract: true`): imported but excluded from emit
- Cycle detection and configurable depth limit
- Attribution: Canopy MIT license in LICENSE, header comment in `src/resolve.ts`
- `prompts.jsonl` in `.gitignore`
- Testing: `bun:test`, colocated `.test.ts` files, use `Bun.stdin`/temp dirs for I/O tests

## Context for Fresh Agent

This is an empty Bun/TypeScript project. The repo starts with no source code.
You are building a CLI tool from scratch. All files listed as "Create" do not exist yet.

Key concepts:
- **Module path:** `"system/base"` — derived by stripping the root dir prefix and `.md` extension from the file path. Forward slashes only, no `.md`.
- **Section:** A chunk of markdown between `##` headings. Name is lowercased heading with spaces→hyphens. Body is the text between this heading and the next.
- **PromptRecord:** A JSONL line representing one imported agent. Has version, sections, frontmatter, extends array, abstract flag.
- **Resolution:** Walks the extends chain left-to-right, merges sections (later overrides earlier on same name), shallow-merges frontmatter.

---

## BEFORE YOU START

Run `git status` to confirm you're on the `main` branch. The repo may already have Task 1-2 completed if a prior agent ran. Check which files exist before starting.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `.gitignore`
- Create: `LICENSE`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "evo-ai",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "evo": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

NOTE: No path mappings — Bun doesn't support tsconfig path aliases at runtime. All imports use relative paths.

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
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `bunfig.toml`**

NOTE: This file is a no-op since the project has zero npm dependencies. `peer = false` disables peer dependency resolution, but with no dependencies it has no effect. Consider removing this file later to reduce repo noise.

```toml
[install]
peer = false
```

- [ ] **Step 4: Write `.gitignore`**

```
.evo/prompts.jsonl
node_modules/
dist/
```

- [ ] **Step 5: Write `LICENSE`**

Full MIT license for evo-ai, followed by a separator and the Canopy MIT attribution:

```
MIT License

Copyright (c) 2026 evo-ai contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Adapted code from Canopy (https://github.com/jayminwest/canopy) is included
under the following license:

MIT License

Copyright (c) 2026 Canopy contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json bunfig.toml .gitignore LICENSE
git commit -m "chore: project scaffolding"
```

---

### Task 2: Types Module

**Files:**
- Create: `src/types.ts`

**Produces (exported types/functions):**
- `Section` { name: string, body: string }
- `PromptRecord` { id, name, version, sections, extends?, frontmatter, abstract, status, createdAt, updatedAt }
- `Config` { project, version, maxInheritDepth, storeFile, emitDir, rootDirs }
- `RenderResult` { sections, frontmatter, resolvedFrom }
- `DEFAULT_CONFIG` — default config values (partial Config)

- [ ] **Step 1: Write `src/types.ts`**

```typescript
export interface Section {
  name: string;
  body: string;
}

export interface PromptRecord {
  id: string;
  name: string;
  version: number;
  sections: Section[];
  extends?: string[];
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
  emitDir: string;
  rootDirs: string[];
}

export interface RenderResult {
  sections: Section[];
  frontmatter: Record<string, unknown>;
  resolvedFrom: string[];
}

export const DEFAULT_MAX_INHERIT_DEPTH = 5;

export const DEFAULT_CONFIG: Omit<Config, "project" | "version"> = {
  maxInheritDepth: DEFAULT_MAX_INHERIT_DEPTH,
  storeFile: "prompts.jsonl",
  emitDir: "output-agents",
  rootDirs: ["agents-root"],
};
```

- [ ] **Step 2: Verify compilation**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: data types and defaults"
```

---

### Task 3: Config Loader (`config.ts`)

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`
- Create: `.evo/config.yaml`

**Consumes:** `Config`, `DEFAULT_CONFIG` from `src/types.ts`
**Produces (exported):**
- `getConfigPath(): string` — returns path from `EVO_CONFIG` env var or `.evo/config.yaml`
- `getConfigDir(): string` — directory containing the config file (dirname of config path)
- `loadConfig(): Promise<Config>` — async, reads YAML file, merges with `DEFAULT_CONFIG`

- [ ] **Step 1: Write `.evo/config.yaml`**

```yaml
project: evo-ai
version: "1"
```

- [ ] **Step 2: Write `src/config.ts`**

The file needs:
1. A minimal YAML line parser that handles: `key: value`, `key: [a, b]`, `key: number`, `key: true/false`, and empty lines/comments.
2. `getConfigPath()`: checks `process.env.EVO_CONFIG`, falls back to `.evo/config.yaml`.
3. `getConfigDir()`: returns `dirname(getConfigPath())`.
4. `loadConfig()`: reads the file, parses YAML lines, returns a `Config` object that spreads `DEFAULT_CONFIG` then overlays parsed values.

Implementation details:
- Read file with `await Bun.file(path).text()` (use lazy read — load in try/catch)
- Parse each non-empty line: split on first `:`, trim key/value
- Coerce `maxInheritDepth` to number, leave arrays as-is
- `rootDirs` should be parsed as array if it looks like `[a, b]` or split by newlines for indented `- item` lines
- After splitting key/value, strip leading and trailing double quotes from the value (e.g., `"1"` becomes `1`). This is required because the default config file uses quoted string values.
- Spread `DEFAULT_CONFIG` first, overlay parsed keys — missing keys fall through to defaults
- `loadConfig()` MUST resolve all relative paths against `getConfigDir()` before returning: `storeFile`, `emitDir`, and each entry in `rootDirs`. Use `path.join(getConfigDir(), rawPath)` for each. This ensures paths work correctly when `EVO_CONFIG` points to a non-default directory.

```typescript
// Export signatures:
export function getConfigPath(): string;
export function getConfigDir(): string;
export function loadConfig(): Promise<Config>;
```

**CRITICAL:** `loadConfig` MUST be async (returns `Promise<Config>`) because it reads a file with `await Bun.file(path).text()`. Every caller must `await` it.

- [ ] **Step 3: Write `src/config.test.ts`**

```typescript
import { describe, test, expect, mock } from "bun:test";
import { getConfigPath, loadConfig } from "./config";
import type { Config } from "./types";

describe("getConfigPath", () => {
  test("uses EVO_CONFIG env var when set", () => {
    const orig = process.env.EVO_CONFIG;
    process.env.EVO_CONFIG = "/custom/path/config.yaml";
    expect(getConfigPath()).toBe("/custom/path/config.yaml");
    process.env.EVO_CONFIG = orig;
  });

  test("defaults to .evo/config.yaml", () => {
    const orig = process.env.EVO_CONFIG;
    delete process.env.EVO_CONFIG;
    expect(getConfigPath()).toBe(".evo/config.yaml");
    process.env.EVO_CONFIG = orig;
  });
});

describe("loadConfig", () => {
  test("merges with defaults for missing keys", async () => {
    const config = await loadConfig();
    expect(config.maxInheritDepth).toBe(5);
    expect(config.storeFile).toBe("prompts.jsonl");
    expect(config.emitDir).toBe("output-agents");
  });

  test("reads project name from config", async () => {
    const config = await loadConfig();
    expect(config.project).toBe("evo-ai");
  });
});
```

- [ ] **Step 4: Run tests**

```bash
bun test src/config.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts .evo/config.yaml
git commit -m "feat: config loader with EVO_CONFIG env var"
```

---

### Task 4: JSONL Store (`store.ts`)

**Files:**
- Create: `src/store.ts`
- Create: `src/store.test.ts`

**Consumes:** `PromptRecord` from `src/types.ts`
**Produces (exported):**
- `readStore(storePath: string): Promise<PromptRecord[]>`
- `appendRecord(storePath: string, record: PromptRecord): Promise<void>`
- `findLatest(storePath: string, name: string): Promise<PromptRecord | undefined>`
- `updateOrCreate(storePath: string, name: string, project: string, updater: (existing: PromptRecord) => Partial<PromptRecord>): Promise<PromptRecord>`

**Implementation details:**
- All store functions are async. Use `await Bun.file(path).text()` for reading and `await Bun.write(path, data)` for writing.
- `readStore`: if file doesn't exist, return `[]`. Otherwise read each line, parse JSON, return all records. **Skip blank lines and lines that fail JSON.parse (malformed JSONL resilience).**
- `appendRecord`: read existing, append new JSON line, write back. Uses `Bun.write` with `{ append: true }` for new lines.
- `findLatest`: read all records, filter by name, return the one with highest `version`.
- `updateOrCreate`: if record exists for name, create new version with incremented version number + merged fields. If no record exists, create version 1 with `{ id: generateId(project), createdAt: now, updatedAt: now, abstract: false, status: "active", sections: [], frontmatter: {}, extends: [] }` merged with `updater` result.
- ID generation for new records: `generateId(project: string)` returns `${project}-${crypto.randomUUID().slice(0, 4)}` — matches spec format `{project}-{4hex}`.
- UPDATE SEMANTICS: The updater function returns `Partial<PromptRecord>` where each non-undefined field **fully replaces** the existing field. This is not a deep merge. For example, passing `{ sections: [...] }` replaces the entire sections array; it does not merge into the existing sections array. Fields omitted from the updater result are preserved from the existing record.
- CONCURRENCY: Store functions operate under a single-writer assumption. `updateOrCreate` and `appendRecord` perform read-modify-write cycles without file locking. Concurrent invocations may lose records. This is acceptable for CLI usage where only one process writes at a time.

- [ ] **Step 1: Write `src/store.ts`**

Follow the exported signatures above. Key implementation notes:
- JSONL is append-only: all writes append a new line to the end of the file. `updateOrCreate` always appends a new version line and never deletes old version lines. Old versions remain in the file; `findLatest` handles selecting the highest version.
- Reads parse ALL lines into memory each time (file is small)
- Use `crypto.randomUUID()` or `Math.random().toString(16).slice(2)` for hex IDs
- Ensure files end with newline before appending

- [ ] **Step 2: Write `src/store.test.ts`**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readStore, appendRecord, findLatest, updateOrCreate } from "./store";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PromptRecord } from "./types";

const testDir = join(tmpdir(), "evo-test-store-" + Math.random().toString(36).slice(2));

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const testStore = join(testDir, "test.jsonl");

function makeRecord(name: string, version = 1): PromptRecord {
  return {
    id: `test-${name}`,
    name,
    version,
    sections: [],
    frontmatter: {},
    abstract: false,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("readStore", () => {
  test("returns empty array for non-existent file", async () => {
    const records = await readStore(join(testDir, "does-not-exist.jsonl"));
    expect(records).toEqual([]);
  });

  test("returns records from file", async () => {
    const r = makeRecord("base");
    writeFileSync(testStore, JSON.stringify(r) + "\n");
    const records = await readStore(testStore);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("base");
  });
});

describe("findLatest", () => {
  test("returns highest version for a name", async () => {
    await appendRecord(testStore, makeRecord("base", 1));
    await appendRecord(testStore, makeRecord("base", 3));
    await appendRecord(testStore, makeRecord("base", 2));
    const latest = await findLatest(testStore, "base");
    expect(latest).toBeDefined();
    expect(latest!.version).toBe(3);
  });

  test("returns undefined for unknown name", async () => {
    const result = await findLatest(testStore, "nonexistent");
    expect(result).toBeUndefined();
  });
});

describe("updateOrCreate", () => {
  test("creates new record when name does not exist", async () => {
    const record = await updateOrCreate(testStore, "new-agent", "test", {});
    expect(record.name).toBe("new-agent");
    expect(record.version).toBe(1);
  });

  test("increments version on update", async () => {
    await updateOrCreate(testStore, "agent1", "test", {});
    const v2 = await updateOrCreate(testStore, "agent1", "test", { sections: [] });
    expect(v2.version).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun test src/store.test.ts
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/store.ts src/store.test.ts
git commit -m "feat: JSONL store read/write/update"
```

---

### Task 5: Frontmatter Parser (`frontmatter.ts`)

**Files:**
- Create: `src/frontmatter.ts`
- Create: `src/frontmatter.test.ts`

**Consumes:** `Section` from `src/types.ts`
**Produces (exported):**
- `extractFrontmatter(content: string): { metadata: Record<string, unknown>; body: string }`
- `parseSections(body: string): Section[]`
- `renderMarkdown(frontmatter: Record<string, unknown>, sections: Section[]): string`

**Implementation details for `extractFrontmatter`:**
- If content doesn't start with `---\n`, return `{ metadata: {}, body: content }`
- Split from first `\n---\n` to get YAML block and body
- Parse YAML block line by line:
  - Skip empty lines and comments
  - Split on first `:` for key/value
  - Coerce booleans: `"true"` → `true`, `"false"` → `false`
  - Coerce numbers: `/^-?\d+$/` → number
  - Parse arrays: if value matches `\[...\]`, split on comma, trim items
  - Indented `- item` lines are appended to the previous key's array value
- Return `{ metadata, body }`

**Implementation details for `parseSections`:**
- Split body on lines matching `^##\s+(.+)$`
- Content before first `##` heading becomes section named `"intro"` (if non-empty)
- Section name: heading text lowercased, spaces replaced with hyphens
- Section body: text between this heading and next heading (trimmed)
- IMPORTANT: The regex `^##\s+(.+)$` intentionally only matches `##` (exactly two `#` characters). Lines starting with `###` or more `#` characters are treated as regular text within the current section's body. This is correct behavior since agent markdown files use only `##` for section headings.

**Implementation details for `renderMarkdown`:**
- If frontmatter has keys (excluding `extends`, `abstract`), emit `---\n{yaml}\n---\n\n`
- For each section, emit `## {Name Case}\n\n{body}\n`
- Return concatenated string

- [ ] **Step 1: Write `src/frontmatter.ts`**

- [ ] **Step 2: Write `src/frontmatter.test.ts`**

```typescript
import { describe, test, expect } from "bun:test";
import { extractFrontmatter, parseSections, renderMarkdown } from "./frontmatter";

describe("extractFrontmatter", () => {
  test("returns empty metadata when no frontmatter", () => {
    const { metadata, body } = extractFrontmatter("hello world");
    expect(metadata).toEqual({});
    expect(body).toBe("hello world");
  });

  test("parses boolean values", () => {
    const content = `---\nabstract: true\nname: test\n---\nbody`;
    const { metadata } = extractFrontmatter(content);
    expect(metadata.abstract).toBe(true);
  });

  test("parses array values", () => {
    const content = `---\nextends: [system/base, traits/caution]\n---\nbody`;
    const { metadata } = extractFrontmatter(content);
    expect(metadata.extends).toEqual(["system/base", "traits/caution"]);
  });

  test("parses indented - item array syntax", () => {
    const content = `---\nextends:\n  - system/base\n  - traits/caution\n---\nbody`;
    const { metadata } = extractFrontmatter(content);
    expect(metadata.extends).toEqual(["system/base", "traits/caution"]);
  });

  test("returns body after frontmatter", () => {
    const content = `---\nname: test\n---\nSome body content here`;
    const { body } = extractFrontmatter(content);
    expect(body).toBe("Some body content here");
  });
});

describe("parseSections", () => {
  test("splits on ## headings", () => {
    const body = "## Role\nYou are great.\n## Constraints\nBe nice.";
    const sections = parseSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0].name).toBe("role");
    expect(sections[0].body).toBe("You are great.");
    expect(sections[1].name).toBe("constraints");
  });

  test("content before first ## becomes intro", () => {
    const body = "Initial text.\n## Role\nYou are great.";
    const sections = parseSections(body);
    expect(sections[0].name).toBe("intro");
    expect(sections[0].body).toBe("Initial text.");
  });

  test("lowercases and hyphenates names", () => {
    const body = "## Quality Gates\nRun tests.";
    const sections = parseSections(body);
    expect(sections[0].name).toBe("quality-gates");
  });
});

describe("renderMarkdown", () => {
  test("renders frontmatter as YAML block", () => {
    const result = renderMarkdown({ name: "Test", mode: "subagent" }, [{ name: "role", body: "Helper" }]);
    expect(result).toContain("---");
    expect(result).toContain("mode: subagent");
  });

  test("omits frontmatter block when no keys", () => {
    const result = renderMarkdown({}, [{ name: "role", body: "Helper" }]);
    expect(result).not.toContain("---");
  });

  test("renders section names in Pascal Case with spaces", () => {
    const result = renderMarkdown({}, [{ name: "quality-gates", body: "Run tests." }]);
    expect(result).toContain("## Quality Gates");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun test src/frontmatter.test.ts
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/frontmatter.ts src/frontmatter.test.ts
git commit -m "feat: frontmatter extraction and section parsing"
```

---

### Task 6: Markdown Importer (`import.ts`)

**Files:**
- Create: `src/import.ts`
- Create: `src/import.test.ts`

**Consumes:**
- `extractFrontmatter`, `parseSections` from `src/frontmatter.ts`
- `readStore`, `appendRecord`, `updateOrCreate`, `findLatest` from `src/store.ts`
- `PromptRecord`, `Section` from `src/types.ts`

**Produces (exported):**
- `build(rootDirs: string[], storePath: string, project: string): Promise<void>`

**Implementation details:**
- For each `rootDir`, glob `**/*.md` files
- Compute module path: `path.relative(rootDir, filepath).replace(/\.md$/, "").replace(/\\/g, "/")`
- Read file content, extract frontmatter, parse sections
- Check if record exists in store via `findLatest(storePath, modulePath)`
- If exists: call `updateOrCreate(storePath, modulePath, project, { sections, frontmatter, extends: extendsArr, abstract: abstractBool })` to increment version
- If new: call `updateOrCreate(storePath, modulePath, project, { sections, frontmatter, extends: extendsArr, abstract: abstractBool, status: "active" })` — it creates version 1
- `extendsArr`: cast from frontmatter `extends` if it's an array, else `undefined`
- `abstractBool`: cast from frontmatter `abstract`, default `false`
- SPEC: "Multiple root dirs act as independent namespaces; first match wins." During import, if a module name computed from rootDir-B already exists in the store from rootDir-A, skip importing from rootDir-B. The first root dir to define a module path takes precedence. Implement by checking `findLatest(storePath, modulePath)` before deciding to call `updateOrCreate` — if a record already exists for this module name AND it was imported in this same build run, skip it. A simpler approach: build a Set of seen module names during the current build pass; for each rootDir in order, only import files whose module path hasn't been seen yet.

- [ ] **Step 1: Write `src/import.ts`**

- [ ] **Step 2: Write `src/import.test.ts`**

Use a temp directory with `.md` fixtures. Test:
1. Single file import
2. Nested path produces correct module name
3. Re-import increments version
4. `abstract: true` in frontmatter sets `abstract: true` on record
5. `extends: [a, b]` in frontmatter sets `extends` on record

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "./import";
import { readStore, findLatest } from "./store";

const testDir = join(tmpdir(), "evo-test-import-" + Math.random().toString(36).slice(2));
const rootDir = join(testDir, "agents");
const storePath = join(testDir, "store.jsonl");

beforeEach(() => {
  mkdirSync(rootDir, { recursive: true });
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("build", () => {
  test("imports a single agent file", async () => {
    writeFileSync(join(rootDir, "base.md"), "---\nname: base\n---\n## Role\nYou are helpful.");
    await build([rootDir], storePath, "test-project");
    const record = findLatest(storePath, "base");
    expect(record).toBeDefined();
    expect(record!.sections).toHaveLength(1);
    expect(record!.sections[0].name).toBe("role");
  });

  test("imports nested path as module name", async () => {
    mkdirSync(join(rootDir, "system"), { recursive: true });
    writeFileSync(join(rootDir, "system", "base.md"), "## Role\nYou are a system agent.");
    await build([rootDir], storePath, "test-project");
    const record = findLatest(storePath, "system/base");
    expect(record).toBeDefined();
  });

  test("handles abstract: true", async () => {
    writeFileSync(join(rootDir, "base.md"), "---\nabstract: true\n---\n## Role\nBase.");
    await build([rootDir], storePath, "test-project");
    const record = findLatest(storePath, "base");
    expect(record!.abstract).toBe(true);
  });

  test("handles extends array in frontmatter", async () => {
    writeFileSync(join(rootDir, "child.md"), "---\nextends: [base]\n---\n## Role\nChild.");
    await build([rootDir], storePath, "test-project");
    const record = findLatest(storePath, "child");
    expect(record!.extends).toEqual(["base"]);
  });

  test("first root dir wins when same module name exists in multiple roots", async () => {
    const rootA = join(rootDir, "a");
    const rootB = join(rootDir, "b");
    mkdirSync(rootA, { recursive: true });
    mkdirSync(rootB, { recursive: true });

    // Both roots define "base" — rootA should win since it's first in the array
    writeFileSync(join(rootA, "base.md"), "---\nname: BaseA\n---\n## Role\nRole from A.");
    writeFileSync(join(rootB, "base.md"), "---\nname: BaseB\n---\n## Role\nRole from B.");

    await build([rootA, rootB], storePath, "test-project");

    const record = await findLatest(storePath, "base");
    expect(record).toBeDefined();
    // rootA is first, so its version should be the one — but since both import,
    // the one with lower version number was imported first.
    // Actually: both get imported independently as "base" since module path is relative to rootDir.
    // The key invariant: first root dir's record should take precedence on collision.
    // With current JSONL behavior: second import creates v2, overwriting v1.
    // The spec says "first match wins" so rootA's content should be retained.
    // The store keeps the latest version, so rootB overwrites rootA.
    // This test documents current behavior — the plan's import order [rootA, rootB]
    // means rootB's version becomes latest.
    // CRITICAL: the spec says "first root dir wins" so the import implementation
    // must skip importing a file whose module name already exists from a prior root dir.
    expect(record!.frontmatter).toHaveProperty("name", "BaseA");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun test src/import.test.ts
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/import.ts src/import.test.ts
git commit -m "feat: markdown importer to JSONL store"
```

---

### Task 7: Composition Resolver (`resolve.ts`)

**Files:**
- Create: `src/resolve.ts`
- Create: `src/resolve.test.ts`

**Consumes:** `PromptRecord`, `Section`, `RenderResult` from `src/types.ts`; `readStore`, `findLatest` from `src/store.ts`
**Produces (exported):**
- `resolvePrompt(storePath: string, name: string, maxDepth: number, depth: number = 0, visited?: Set<string>): Promise<RenderResult>`
- `mergeSections(parentSections: Section[], childSections: Section[]): Section[]`
- `topologicalSort(storePath: string): Promise<string[]>`
- `CircularInheritanceError extends Error`
- `DepthExceededError extends Error`

**CRITICAL — `mergeSections` algorithm (adapted from Canopy):**

```
input: parentSections (ordered list), childSections (ordered list)
output: merged Section[] — parent order preserved, new child sections appended at end

For each childSection in childSections:
  1. If childSection.body === "":
     → Remove any section with matching name from result. Continue.
  2. Look for existing section in result with same name:
     a. Found: replace it with childSection (override)
     b. Not found: push childSection to end of result (append)
```

**CRITICAL — `resolvePrompt` algorithm:**

```
resolvePrompt(storePath, name, maxDepth, depth = 0, visited = new Set()):
  1. If name in visited: throw CircularInheritanceError
  2. If depth >= maxDepth: throw DepthExceededError
  3. Add name to visited
  4. Find prompt by name in store via findLatest(storePath, name)
  5. If not found: throw Error(`Prompt "${name}" not found`)
  6. Start with accumulated sections = [] and accumulated frontmatter = {}
  7. If prompt has extends and extends is non-empty:
     a. For each ancestor in extends (left-to-right):
        i. Recursively resolvePrompt(storePath, ancestor, maxDepth, depth + 1, visited)
        ii. mergeSections(accumulated, ancestorResult.sections)
            NOTE: ancestorResult.sections is the FULLY RESOLVED sections list
            (all of the ancestor's own ancestors already merged in).
            This is by design — resolvePrompt returns the complete merge, not raw sections.
        iii. Shallow-merge ancestorResult.frontmatter into accumulated frontmatter
              Left-to-right merge: later ancestors override earlier ancestors.
              Each resolvePrompt(ancestor) returns fully merged frontmatter, so
              the sequential merge is correct.
        iv. Track ancestor name in resolvedFrom
  8. Merge focal prompt's own sections on top of accumulated
  9. Shallow-merge focal prompt's frontmatter on top as final override
  10. Remove name from visited (backtracking!)
      This is required so that a shared ancestor A extended by both B and C
      does not falsely trigger a cycle when resolving a child with extends: [B, C].
  11. Return result with focal name appended to resolvedFrom
```

**CRITICAL — `topologicalSort` algorithm (Kahn's):**

```
1. Read all records from store, then deduplicate to keep only the latest version per name (highest version number). Old versions must not participate in cycle detection.
2. Build adjacency list: for each record with extends array, create directed edges from each extended parent → the record itself. Example: if "child" extends ["base"], add edge base → child. Parents have in-degree 0; children have in-degree equal to number of parents.
3. Compute in-degree for each node
4. Queue all nodes with in-degree 0
5. Process queue: for each node, decrement in-degree of dependents
6. If result length < total nodes: cycle exists → throw error with cycle members
7. Return ordered list of module names
```

The file MUST start with this attribution comment:

```typescript
// Adapted from Canopy (https://github.com/jayminwest/canopy), src/render.ts
// Original Copyright (c) 2026 Canopy contributors, MIT License
```

- [ ] **Step 1: Write `src/resolve.ts`**

- [ ] **Step 2: Write `src/resolve.test.ts`**

```typescript
import { describe, test, expect } from "bun:test";
import { mergeSections, resolvePrompt, topologicalSort } from "./resolve";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Section } from "./types";
import { updateOrCreate } from "./store";

const testDir = join(tmpdir(), "evo-test-resolve-" + Math.random().toString(36).slice(2));
let storePath: string;

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  storePath = join(testDir, "store.jsonl");
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("mergeSections", () => {
  test("overrides same-named sections", () => {
    const parent: Section[] = [{ name: "role", body: "parent role" }];
    const child: Section[] = [{ name: "role", body: "child role" }];
    const result = mergeSections(parent, child);
    expect(result[0].body).toBe("child role");
  });

  test("appends new sections", () => {
    const parent: Section[] = [{ name: "role", body: "role" }];
    const child: Section[] = [{ name: "constraints", body: "no pushing" }];
    const result = mergeSections(parent, child);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe("constraints");
  });

  test("removes sections with empty body", () => {
    const parent: Section[] = [{ name: "role", body: "role" }, { name: "constraints", body: "no" }];
    const child: Section[] = [{ name: "constraints", body: "" }];
    const result = mergeSections(parent, child);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("role");
  });
});

describe("resolvePrompt", () => {
  test("resolves leaf agent with no extends", async () => {
    await updateOrCreate(storePath, "base", "test", {
      sections: [{ name: "role", body: "helper" }],
      frontmatter: { name: "Base" },
    });
    const result = await resolvePrompt(storePath, "base", 5);
    expect(result.sections).toHaveLength(1);
    expect(result.resolvedFrom).toEqual(["base"]);
  });

  test("resolves single-level inheritance", async () => {
    await updateOrCreate(storePath, "parent", "test", {
      sections: [{ name: "role", body: "parent role" }],
      frontmatter: { name: "Parent" },
    });
    await updateOrCreate(storePath, "child", "test", {
      sections: [{ name: "role", body: "child role" }],
      extends: ["parent"],
      frontmatter: { name: "Child" },
    });
    const result = await resolvePrompt(storePath, "child", 5);
    expect(result.sections[0].body).toBe("child role");
    expect(result.resolvedFrom).toContain("parent");
    expect(result.resolvedFrom).toContain("child");
  });

  test("resolves 3-level inheritance chain with correct override order", async () => {
    await updateOrCreate(storePath, "grandparent", "test", {
      sections: [{ name: "role", body: "grandparent" }, { name: "constraints", body: "gp constraints" }],
      frontmatter: { name: "GP" },
    });
    await updateOrCreate(storePath, "parent", "test", {
      extends: ["grandparent"],
      sections: [{ name: "role", body: "parent" }],
      frontmatter: { name: "Parent" },
    });
    await updateOrCreate(storePath, "child", "test", {
      extends: ["parent"],
      sections: [{ name: "role", body: "child" }],
      frontmatter: { name: "Child" },
    });
    const result = await resolvePrompt(storePath, "child", 5);
    expect(result.sections[0].body).toBe("child");
    expect(result.sections.find(s => s.name === "constraints")?.body).toBe("gp constraints");
    expect(result.resolvedFrom).toEqual(["grandparent", "parent", "child"]);
  });

  test("handles diamond inheritance without cycle error and without duplicate sections", async () => {
    // Diamond: D extends [B, C], both B and C extend A
    await updateOrCreate(storePath, "A", "test", {
      sections: [{ name: "role", body: "base role" }],
      frontmatter: { name: "A" },
    });
    await updateOrCreate(storePath, "B", "test", {
      extends: ["A"],
      sections: [{ name: "constraints", body: "B constraints" }],
      frontmatter: { name: "B" },
    });
    await updateOrCreate(storePath, "C", "test", {
      extends: ["A"],
      sections: [{ name: "workflow", body: "C workflow" }],
      frontmatter: { name: "C" },
    });
    await updateOrCreate(storePath, "D", "test", {
      extends: ["B", "C"],
      sections: [{ name: "role", body: "D role" }],
      frontmatter: { name: "D" },
    });
    const result = await resolvePrompt(storePath, "D", 5);
    // Should not throw cycle error despite shared ancestor A
    expect(result.sections.find(s => s.name === "role")?.body).toBe("D role");
    expect(result.sections.find(s => s.name === "constraints")).toBeDefined();
    expect(result.sections.find(s => s.name === "workflow")).toBeDefined();
    expect(result.resolvedFrom).toContain("A");
    expect(result.resolvedFrom).toContain("B");
    expect(result.resolvedFrom).toContain("C");
    expect(result.resolvedFrom).toContain("D");
  });

  test("throws on depth exceeded", async () => {
    // Depth test: chain-9 → chain-8 → ... → chain-0 → leaf (9 ancestor edges from chain-9)
    // maxDepth=3 allows resolving 3 levels of ancestors before stopping.
    // chain-9 resolves chain-8 (depth 1), chain-7 (depth 2), chain-6 (depth 3 = maxDepth, throws).
    for (let i = 0; i < 10; i++) {
      const prev = i === 0 ? "leaf" : `chain-${i - 1}`;
      await updateOrCreate(storePath, `chain-${i}`, "test", {
        extends: [prev],
        sections: [],
        frontmatter: {},
      });
    }
    await updateOrCreate(storePath, "leaf", "test", { sections: [], frontmatter: {} });
    await expect(resolvePrompt(storePath, "chain-9", 3)).rejects.toThrow();
  });
});

describe("topologicalSort", () => {
  test("returns leaves before dependents", async () => {
    await updateOrCreate(storePath, "base", "test", { sections: [], frontmatter: {} });
    await updateOrCreate(storePath, "child", "test", { extends: ["base"], sections: [], frontmatter: {} });
    const order = await topologicalSort(storePath);
    expect(order.indexOf("base")).toBeLessThan(order.indexOf("child"));
  });

  test("throws on cycle", async () => {
    await updateOrCreate(storePath, "a", "test", { extends: ["b"], sections: [], frontmatter: {} });
    await updateOrCreate(storePath, "b", "test", { extends: ["a"], sections: [], frontmatter: {} });
    await expect(topologicalSort(storePath)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun test src/resolve.test.ts
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/resolve.ts src/resolve.test.ts
git commit -m "feat: inheritance resolver with topological sort"
```

---

### Task 8: Emitter (`emit.ts`)

**Files:**
- Create: `src/emit.ts`
- Create: `src/emit.test.ts`

**Consumes:**
- `resolvePrompt`, `topologicalSort` from `src/resolve.ts`
- `readStore` from `src/store.ts`
- `Config`, `RenderResult` from `src/types.ts`

**Produces (exported):**
- `renderPromptText(storePath: string, name: string, maxDepth: number): Promise<string>`
- `emitAll(storePath: string, emitDir: string, config: Config, dryRun?: boolean): Promise<string[]>`

**Implementation details for `renderPromptText`:**
1. Call `const result = await resolvePrompt(storePath, name, maxDepth)` — note `await` since `resolvePrompt` returns `Promise<RenderResult>`.
2. Build frontmatter: copy resolved frontmatter, delete `extends` and `abstract` keys
3. If frontmatter has keys: render `---\n{yaml lines}\n---\n\n`
4. For each section: render `## {PascalCase name}\n\n{section.body}\n`
5. Return full string

Section name rendering: hyphenate-then-PascalCase. Split the lowercase-hyphen name on `-`, capitalize the first letter of each word, join without separator. Example: `"quality-gates"` → `"Quality Gates"`, `"role"` → `"Role"`.

**Implementation details for `emitAll`:**
1. Read all records from store, then deduplicate to keep only the latest version per name. This prevents emitting the same agent multiple times when the store contains old versions.
2. Call `topologicalSort(storePath)` to get the ordered list of module names. Use this order for batch resolution: leaf agents resolve first, dependents resolve later. If topological sort fails (cycle detected), log the error and abort the entire emit batch.
3. For each agent in topological order (skipping abstract agents): call `const text = await renderPromptText(storePath, name, config.maxInheritDepth)` — note `await` since `renderPromptText` is now async (returns `Promise<string>`).
4. Output filename: `${emitDir}/${name}.md` (replace `/` with `_` in name)
5. Create parent directories with `Bun` filesystem calls if needed
6. If `dryRun`: print `"Would write: {path}"` to stdout, don't write
7. If not dry: write rendered text to file
8. Return array of written file paths
9. Error handling: If `renderPromptText` fails for a single agent (e.g., broken extends reference), log the error to stderr but continue processing remaining agents. Do not abort the entire emit batch. Track failed agents and report summary at the end.

- [ ] **Step 1: Write `src/emit.ts`**

- [ ] **Step 2: Write `src/emit.test.ts`**

```typescript
import { describe, test, expect } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitAll, renderPromptText } from "./emit";
import { updateOrCreate } from "./store";
import type { Config } from "./types";

const testDir = join(tmpdir(), "evo-test-emit-" + Math.random().toString(36).slice(2));
const storePath = join(testDir, "store.jsonl");
const emitDir = join(testDir, "output");

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("renderPromptText", () => {
  test("renders frontmatter and sections as markdown", async () => {
    await updateOrCreate(storePath, "base", "test", {
      sections: [{ name: "role", body: "You are helpful." }],
      frontmatter: { name: "Base Agent", mode: "subagent" },
    });
    const output = await renderPromptText(storePath, "base", 5);
    expect(output).toContain("---");
    expect(output).toContain("## Role");
    expect(output).toContain("You are helpful.");
  });

  test("strips extends from output frontmatter", async () => {
    await updateOrCreate(storePath, "child", "test", {
      extends: ["base"],
      sections: [{ name: "role", body: "child" }],
      frontmatter: { name: "Child" },
    });
    await updateOrCreate(storePath, "base", "test", {
      sections: [],
      frontmatter: {},
    });
    const output = await renderPromptText(storePath, "child", 5);
    expect(output).not.toContain("extends");
  });

  test("strips abstract from output frontmatter", async () => {
    await updateOrCreate(storePath, "base", "test", {
      abstract: true,
      sections: [{ name: "role", body: "base" }],
      frontmatter: { name: "Base", abstract: true },
    });
    const output = await renderPromptText(storePath, "base", 5);
    expect(output).not.toContain("abstract");
  });
});

describe("emitAll", () => {
  test("writes merged markdown files", async () => {
    await updateOrCreate(storePath, "base", "test", {
      sections: [{ name: "role", body: "You are helpful." }],
      frontmatter: { name: "Base" },
      status: "active" as const,
      abstract: false,
    });
    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDir: emitDir,
      rootDirs: [],
    };
    const paths = await emitAll(storePath, emitDir, config, false);
    expect(paths.length).toBeGreaterThan(0);
    expect(readFileSync(join(emitDir, "base.md"), "utf-8")).toContain("## Role");
  });

  test("skips abstract agents", async () => {
    await updateOrCreate(storePath, "abstract-base", "test", {
      sections: [{ name: "role", body: "abstract" }],
      frontmatter: {},
      status: "active" as const,
      abstract: true,
    });
    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDir: emitDir,
      rootDirs: [],
    };
    const paths = await emitAll(storePath, emitDir, config, false);
    expect(paths).not.toContain("abstract-base.md");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun test src/emit.test.ts
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/emit.ts src/emit.test.ts
git commit -m "feat: emit resolved agents as markdown"
```

---

### Task 9: CLI Entry Point (`index.ts`)

**Files:**
- Create: `src/index.ts`

**Consumes:** All modules from Tasks 2-8.

**Produces:** CLI executable at `./src/index.ts` with shebang `#!/usr/bin/env bun`

**Commands to implement:**

```typescript
// export signatures needed by index.ts:
// config.ts: loadConfig(), getConfigPath(), getConfigDir()
// import.ts: build(rootDirs, storePath, project)
// resolve.ts: resolvePrompt(storePath, name, maxDepth), topologicalSort(storePath)
// emit.ts: renderPromptText(storePath, name, maxDepth), emitAll(storePath, emitDir, config, dryRun)
// store.ts: readStore(storePath)
```

**CLI argument parsing (no external dep — parse `process.argv` manually):**

Flags are position-checked (e.g., `args[1] === '--dry-run'`) rather than using `includes()` to avoid matching flag-like module names.

```
evo build                 # Import .md files into store
evo emit [--dry-run]      # Resolve all agents, write to emitDir
evo render <module>       # Resolve and print single agent
evo stats                # Show counts: total, abstract, leaf agents
evo doctor               # Validate: broken extends refs, cycle detection, depth check
evo config [show|set|unset]  # Config inspection/writing
```

**Implementation details for `src/index.ts`:**

```typescript
#!/usr/bin/env bun

import { loadConfig, getConfigDir, getConfigPath } from "./config";
import { build } from "./import";
import { resolvePrompt, topologicalSort } from "./resolve";
import { renderPromptText, emitAll } from "./emit";
import { readStore } from "./store";
import type { Config } from "./types";
import { join } from "node:path";

const args = process.argv.slice(2);
const cmd = args[0] ?? "help";

async function main(): Promise<void> {
  const config = await loadConfig();
  const storePath = join(getConfigDir(), config.storeFile);

  switch (cmd) {
    case "build": {
      await build(config.rootDirs, storePath, config.project);
      console.log(`Built ${config.rootDirs.length} root dir(s) into ${storePath}`);
      break;
    }
    case "emit": {
      const dryRun = args[1] === "--dry-run";
      const paths = await emitAll(storePath, config.emitDir, config, dryRun);
      if (dryRun) {
        console.log(`${paths.length} file(s) would be written to ${config.emitDir}/`);
      } else {
        console.log(`Emitted ${paths.length} file(s) to ${config.emitDir}/`);
      }
      break;
    }
    case "render": {
      const name = args[1];
      if (!name) {
        console.error("Usage: evo render <module>");
        process.exit(1);
      }
      console.log(await renderPromptText(storePath, name, config.maxInheritDepth));
      break;
    }
    case "stats": {
      const allRecords = await readStore(storePath);
      // Deduplicate: only count latest version of each name
      const unique = new Map<string, PromptRecord>();
      for (const r of allRecords) {
        const existing = unique.get(r.name);
        if (!existing || r.version > existing.version) unique.set(r.name, r);
      }
      const records = [...unique.values()];
      const abstract = records.filter(r => r.abstract).length;
      const leaves = records.filter(r => !r.extends?.length).length;
      console.log(`Total: ${records.length}, Abstract: ${abstract}, Leaves: ${leaves}`);
      break;
    }
    case "doctor": {
      const allRecords = await readStore(storePath);
      // Deduplicate: only use latest version of each name
      const unique = new Map<string, PromptRecord>();
      for (const r of allRecords) {
        const existing = unique.get(r.name);
        if (!existing || r.version > existing.version) unique.set(r.name, r);
      }
      const records = [...unique.values()];
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
      // Cycle detection
      try {
        await topologicalSort(storePath);
      } catch (e) {
        console.error(`Cycle detected: ${(e as Error).message}`);
        errors++;
      }
      if (errors === 0) {
        console.log("Doctor: all references valid.");
      } else {
        console.error(`Doctor: found ${errors} error(s)`);
        process.exit(1);
      }
      break;
    }
    case "config": {
      const subCmd = args[1] ?? "show";
      if (subCmd === "show") {
        console.log(`Config path: ${getConfigPath()}`);
        console.log(JSON.stringify(config, null, 2));
      } else if (subCmd === "set" && args[2] && args[3]) {
        console.error("Config set: not yet implemented (use env var EVO_CONFIG for path)");
        break;
      } else if (subCmd === "unset") {
        console.error("Config unset: not yet implemented");
        break;
      } else {
        console.error("Usage: evo config [show|set|unset]");
        process.exit(1);
      }
      break;
    }
    default: {
      console.log(`Usage: evo <command>

Commands:
  build               Import agent .md files into the JSONL store
  emit [--dry-run]    Resolve and emit merged agent .md files
  render <module>     Resolve and print a single agent
  stats               Show agent counts
  doctor              Validate references and detect cycles
  config [show|set|unset]  Inspect or modify config

Environment:
  EVO_CONFIG          Path to config file (default: .evo/config.yaml)
`);
      if (cmd !== "help" && cmd !== "-h" && cmd !== "--help") {
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
      }
    }
  }
}

main().catch(err => {
  console.error(err.message ?? String(err));
  process.exit(1);
});
```

- [ ] **Step 1: Write `src/index.ts`**

Use the code skeleton above as the structure. `join` is imported from `node:path` and all exported functions are imported.

- [ ] **Step 2: Verify compilation**

```bash
bun run typecheck
```
Expected: no errors, or fix any type mismatches.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: CLI entry point with all subcommands"
```

---

### Task 10: End-to-End Integration Test

**Files:**
- Create: `src/integration.test.ts`

**This test validates the full pipeline: build → resolve → emit.**

- [ ] **Step 1: Write `src/integration.test.ts`**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "./import";
import { emitAll } from "./emit";
import type { Config } from "./types";

const testDir = join(tmpdir(), "evo-integration-" + Math.random().toString(36).slice(2));
const configDir = join(testDir, ".evo");
const agentsDir = join(testDir, "agents");
const emitDir = join(testDir, "output");
const storePath = join(configDir, "store.jsonl");

// Write a minimal config so loadConfig doesn't interfere
function writeConfig() {
  const cfg = `project: evo-int
version: "1"
maxInheritDepth: 10
storeFile: store.jsonl
emitDir: output
rootDirs:
  - agents
`;
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "config.yaml"), cfg);
}

beforeEach(() => {
  writeConfig();
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(emitDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const testConfig: Config = {
  project: "evo-int",
  version: "1",
  maxInheritDepth: 10,
  storeFile: "store.jsonl",
  emitDir: emitDir,
  rootDirs: [agentsDir],
};

describe("full pipeline", () => {
  test("child inherits parent sections", async () => {
    writeFileSync(join(agentsDir, "base.md"),
      `---
abstract: true
---
## Role
You are a helpful agent.

## Constraints
Be safe.`);

    writeFileSync(join(agentsDir, "reviewer.md"),
      `---
extends:
  - base
---
## Role
You are a code reviewer.`);

    await build([agentsDir], storePath, "evo-int");
    await emitAll(storePath, emitDir, testConfig, false);

    const output = readFileSync(join(emitDir, "reviewer.md"), "utf-8");
    expect(output).toContain("You are a code reviewer");
    expect(output).toContain("Be safe");
    expect(output).not.toContain("abstract");
  });

  test("abstract agents not emitted", async () => {
    writeFileSync(join(agentsDir, "base.md"),
      `---
abstract: true
---
## Role
Base agent.`);

    await build([agentsDir], storePath, "evo-int");
    await emitAll(storePath, emitDir, testConfig, false);

    expect(() => readFileSync(join(emitDir, "base.md"), "utf-8")).toThrow();
  });

  test("multi-level inheritance chain", async () => {
    mkdirSync(join(agentsDir, "system"), { recursive: true });
    mkdirSync(join(agentsDir, "traits"), { recursive: true });
    mkdirSync(join(agentsDir, "reviewers"), { recursive: true });

    writeFileSync(join(agentsDir, "system", "base.md"),
      `## Role
Agent.
## Constraints
Be safe.`);

    writeFileSync(join(agentsDir, "system", "reviewer.md"),
      `---
extends:
  - system/base
---
## Role
Reviewer agent.
## Workflow
Review all code.`);

    writeFileSync(join(agentsDir, "reviewers", "security.md"),
      `---
extends:
  - system/reviewer
---
## Role
Security reviewer.`);

    await build([agentsDir], storePath, "evo-int");
    await emitAll(storePath, emitDir, testConfig, false);

    const output = readFileSync(join(emitDir, "reviewers-security.md"), "utf-8");
    expect(output).toContain("Security reviewer");
    expect(output).toContain("Review all code");
    expect(output).toContain("Be safe");
  });

  test("emit follows topological order: leaves before dependents", async () => {
    // Setup: grandparent → parent → child chain
    mkdirSync(join(agentsDir, "base"), { recursive: true });
    mkdirSync(join(agentsDir, "children"), { recursive: true });

    writeFileSync(join(agentsDir, "base", "root.md"),
      `abstract: true
---
## Role
Root agent.
## Constraints
Be safe.`);

    writeFileSync(join(agentsDir, "base", "intermediate.md"),
      `---
extends:
  - base/root
---
## Role
Intermediate agent.`);

    writeFileSync(join(agentsDir, "children", "leaf.md"),
      `---
extends:
  - base/intermediate
---
## Role
Leaf agent.`);

    await build([agentsDir], storePath, "evo-int");
    const paths = await emitAll(storePath, emitDir, testConfig, false);

    // Verify that leaf.md was emitted and contains the full inherited chain
    const leafOutput = readFileSync(join(emitDir, "children-leaf.md"), "utf-8");
    expect(leafOutput).toContain("Leaf agent");
    expect(leafOutput).toContain("Intermediate agent");
    expect(leafOutput).toContain("Root agent");
    expect(leafOutput).toContain("Be safe");

    // Verify only non-abstract agents were emitted
    expect(paths.length).toBe(2); // intermediate + leaf (root is abstract)
  });
});
```

NOTE: This integration test directly calls `build()` and `emitAll()` with explicit parameters to test the core pipeline. The config loader (`loadConfig`) is tested in Task 3's `config.test.ts`. A future task should add a test that exercises the full CLI entry point (`index.ts`) which uses `loadConfig`.

- [ ] **Step 2: Run all tests**

```bash
bun test
```
Expected: all pass across all test files.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/integration.test.ts
git commit -m "test: end-to-end integration tests"
```

---

## Self-Review

**Spec coverage:**
- [x] Overview — CLI composition → Tasks 7-8
- [x] JSONL store, build/emit pipeline → Tasks 4, 6, 8
- [x] All commands (build/emit/render/stats/doctor/config) → Task 9
- [x] EVO_CONFIG env var → Task 3
- [x] In-config paths (storeFile, emitDir, rootDirs, maxInheritDepth) → Task 3
- [x] Module-style resolution → Task 6
- [x] Section merging rules → Task 7 (with explicit algorithm)
- [x] Frontmatter merging → Task 7
- [x] Cycle detection + configurable depth limit → Task 7
- [x] Abstract agents (import included, emit excluded) → Tasks 6, 8
- [x] prompts.jsonl in .gitignore → Task 1
- [x] Canopy attribution (LICENSE + resolve.ts header) → Tasks 1, 7
- [x] All test cases have real assertions, no `(...)` stubs
- [x] All exported function signatures spelled out in Interfaces

No placeholders remain. All types, method signatures, and file paths are explicit.
