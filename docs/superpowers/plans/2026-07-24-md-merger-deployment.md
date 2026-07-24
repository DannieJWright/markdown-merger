# md-merger npm Deployment + OpenCode Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy md-merger as an npm-published CLI tool and OpenCode plugin with bundled defaults, workspace-based monorepo, and CI/CD publishing.

**Architecture:** Two npm packages under one repo: `md-merger` (root CLI) and `@md-merger/opencode-plugin` (plugin). Plugin imports from root via workspace resolution. Bundled agent templates in `defaults/`. CI publishes both on `v*` tags.

**Tech Stack:** Bun (runtime), TypeScript, npm with OIDC trusted publishing, GitHub Actions, @opencode-ai/plugin types

## Global Constraints

- Bun runtime project — all source uses Bun APIs (`Bun.file()`)
- Zero npm runtime dependencies for md-merger CLI — all parsing is hand-rolled
- Plugin uses `@opencode-ai/plugin` (types only) as its runtime dependency
- Build target: `--target node` (produces standard ESM that Bun consumes fine)
- Both packages share the same version number
- Named export `mdMergerPlugin` for plugin entry — NOT default export
- `workspace:*` protocol for monorepo resolution (Bun supports it)
- Config reads from `$MD_MERGER_CONFIG` env var or `.md-merger/config.yaml`
- Spec: `docs/superpowers/specs/2026-07-24-md-merger-deployment-design.md`
- `exports` keys pointing to `.ts` files (in `package.json`) is intentional and relies on Bun's native TypeScript support. npm consumers must use Bun or a TS-capable runtime.

---

### Task 1: Root package.json — Add publishing metadata, exports, workspaces

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `package.json` structure
- Produces: publishable package.json with `exports`, `files`, `publishConfig`, `workspaces`

- [ ] **Step 1: Read current package.json**

Read `package.json` to get current state.

- [ ] **Step 2: Update package.json**

Apply these changes to `package.json`:

```json
{
  "name": "md-merger",
  "version": "1.0.0",
  "description": "CLI tool for managing AI agent/skill prompts as Markdown files with hierarchical inheritance",
  "type": "module",
  "bin": {
    "md-merger": "./dist/index.js"
  },
  "exports": {
    ".": {
      "import": "./src/api.ts",
      "types": "./src/api.ts"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist/", "defaults/", "README.md"],
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "workspaces": ["opencode-plugin"],
  "license": "MIT",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "bundle": "bun build ./src/index.ts --outdir ./dist --target node --banner 'entry:#!/usr/bin/env node'",
    "build": "bun src/index.ts build",
    "emit": "bun src/index.ts emit",
    "render": "bun src/index.ts render",
    "stats": "bun src/index.ts stats",
    "doctor": "bun src/index.ts doctor",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` and check no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add npm publishing metadata, exports, workspaces"
```

---

### Task 2: tsconfig.json — Include opencode-plugin directory

**Files:**
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: existing tsconfig structure
- Produces: tsconfig that covers plugin source for type-checking

- [ ] **Step 1: Update tsconfig.json include**

```json
{
  "compilerOptions": { ... },
  "include": ["src/**/*.ts", "tests/**/*.ts", "opencode-plugin/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests/build"]
}
```

The only change is adding `"opencode-plugin/**/*.ts"` to the `include` array.

- [ ] **Step 2: Verify typecheck passes**

Run: `bun run typecheck` (or `tsc --noEmit`)
Expected: No errors (plugin doesn't exist yet but glob won't fail if dir is empty)

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: include opencode-plugin in tsconfig"
```

---

### Task 3: Create src/api.ts — Public library export surface

**Files:**
- Create: `src/api.ts`

**Interfaces:**
- Consumes: `loadConfig` from `./config`, `emitAll` from `./emit`, `Config` type and `DEFAULT_CONFIG` from `./types`
- Produces: Re-exports needed by `@md-merger/opencode-plugin`

- [ ] **Step 1: Write the library API file**

```typescript
// src/api.ts — public library API
export { loadConfig, getConfigPath } from "./config";
export { emitAll } from "./emit";
export type { Config } from "./types";
export { DEFAULT_CONFIG, DEFAULT_MAX_INHERIT_DEPTH } from "./types";
```

- [ ] **Step 2: Write a test**

Create `tests/unit/api.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import * as api from "../../src/api";

describe("api.ts exports", () => {
  it("exports loadConfig as a function", () => {
    expect(typeof api.loadConfig).toBe("function");
  });

  it("exports getConfigPath as a function", () => {
    expect(typeof api.getConfigPath).toBe("function");
  });

  it("exports emitAll as a function", () => {
    expect(typeof api.emitAll).toBe("function");
  });

  it("exports DEFAULT_CONFIG with expected keys", () => {
    expect(api.DEFAULT_CONFIG).toHaveProperty("maxInheritDepth");
    expect(api.DEFAULT_CONFIG).toHaveProperty("storeFile");
    expect(api.DEFAULT_CONFIG).toHaveProperty("emitDirs");
    expect(api.DEFAULT_CONFIG).toHaveProperty("rootDirs");
  });
});
```

- [ ] **Step 3: Run test**

Run: `bun test tests/unit/api.test.ts`
Expected: PASS — all exports match expected signatures

- [ ] **Step 4: Commit**

```bash
git add src/api.ts tests/unit/api.test.ts
git commit -m "feat: add public API export surface for plugin"
```

---

### Task 4: Create defaults/ directory with core agent templates

**Files:**
- Create: `defaults/agents/orchestrator.md`
- Create: `defaults/agents/explorer.md`
- Create: `defaults/agents/oracle.md`
- Create: `defaults/agents/fixer.md`
- Create: `defaults/agents/designer.md`
- Create: `defaults/skills/.gitkeep`

**Interfaces:**
- Consumes: none
- Produces: Five bundled agent .md files that serve as starting templates

- [ ] **Step 1: Create directory structure**

Create the directories:
```
defaults/
├── agents/
└── skills/
```

- [ ] **Step 2: Write orchestrator.md**

```markdown
---
type: agent
---

# You Are the Orchestrator

You are a workflow manager for coding work. Your job is to plan, schedule, delegate, monitor, reconcile, and verify specialist-agent work. You are not the default implementation worker.

## Core Responsibility

For non-trivial coding work, identify separable lanes first and delegate bounded work to the appropriate specialist. Handle work directly only when it is one isolated, clear, low-risk action.

## Planning and Dispatching

- Evaluate approach by quality, speed, and cost
- Route tasks to the best specialist agent
- Track background task state
- Reconcile terminal results into one coherent outcome
```

- [ ] **Step 3: Write explorer.md**

```markdown
---
type: agent
---

# You Are the Explorer

You are a fast codebase search and pattern matching agent. Use this lane for discovering what exists before planning.

## Core Responsibility

Provide compressed context maps of the codebase for the orchestrator to plan effectively.

## Capabilities

- Glob-based file discovery
- AST-aware pattern searching
- Directory traversal
- Summarized mapping over full contents

## Return Format

Return a concise map of files, patterns, and structures found. Compress findings into actionable context.
```

- [ ] **Step 4: Write oracle.md**

```markdown
---
type: agent
---

# You Are the Oracle

You are a strategic technical advisor. Use this lane for architecture decisions, risk assessment, and code review.

## Core Responsibility

Provide deep architectural reasoning, system-level trade-off analysis, complex debugging strategy, and maintainability review.

## Capabilities

- Architecture decisions with long-term impact analysis
- Performance vs. maintainability trade-off evaluation
- Complex debugging and root cause investigation
- Code simplification and YAGNI scrutiny

## When to Invoke

- Major architectural decisions
- Problems persisting after multiple fix attempts
- Security, scalability, or data integrity decisions
- Code needs simplification
```

- [ ] **Step 5: Write fixer.md**

```markdown
---
type: agent
---

# You Are the Fixer

You are a fast implementation and execution specialist for well-defined tasks.

## Core Responsibility

Execute bounded implementation and headless code changes efficiently. Focus on speed and correctness for clearly specified work.

## Capabilities

- Fast code editing across multiple files
- Mechanical refactoring and pattern replacement
- Implementation of clearly spec'd features
- Automated test updates

## Constraints

- Do NOT perform research or architectural decisions
- Do NOT apply design taste or UI polish
- Only execute on well-defined, bounded tasks
```

- [ ] **Step 6: Write designer.md**

```markdown
---
type: agent
---

# You Are the Designer

You are a UI/UX design specialist. Use this lane for all visual and interaction quality work.

## Core Responsibility

Own layout, spacing, hierarchy, motion, color, affordances, responsive behavior, and overall feel of user-facing interfaces.

## Capabilities

- Responsive layout architecture
- Visual hierarchy and spacing systems
- Animation and micro-interaction design
- Design system component architecture
- Overall aesthetic quality and polish

## When to Invoke

- Any user-facing interface needing polish
- Layout, styling, or responsive behavior changes
- Component feel or interaction quality
```

- [ ] **Step 7: Write skills/.gitkeep**

Create an empty file `defaults/skills/.gitkeep` to preserve the directory in git.

- [ ] **Step 8: Commit**

```bash
git add defaults/
git commit -m "feat: add five core bundled agent templates"
```

---

### Task 5: Create plugin package.json and directory structure

**Files:**
- Create: `opencode-plugin/package.json`

**Interfaces:**
- Consumes: md-merger workspace dependency
- Produces: valid plugin package.json

- [ ] **Step 1: Create plugin package.json**

```json
{
  "name": "@md-merger/opencode-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "files": ["src/", "defaults/"],
  "dependencies": {
    "md-merger": "workspace:*",
    "@opencode-ai/plugin": "^1.0.0"
  },
"scripts": {
    "prepublishOnly": "node -e \"const p=require('./package.json'); p.dependencies['md-merger']='^' + p.version; require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2)+'\\n'); const {cpSync, existsSync} = require('fs'); if (existsSync('../../defaults')) cpSync('../../defaults', './defaults', {recursive:true}); else console.warn('defaults/ not found — skip copy')\""
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

Note: Uses `workspace:*` in `dependencies` (Bun's workspace protocol only works in `dependencies`, not `peerDependencies`). The `prepublishOnly` script replaces `workspace:*` with `^1.0.0` before publishing to npm, so consumers get a normal semver range. It also copies `../../defaults/` into `opencode-plugin/defaults/` so the plugin ships its own copy of bundled agent templates (the root's `defaults/` is included in the main `md-merger` package's `files` array and won't survive in a separate `npm install @md-merger/opencode-plugin`).

- [ ] **Step 2: Create plugin src directory**

Create `opencode-plugin/src/` directory structure.

- [ ] **Step 3: Commit**

```bash
git add opencode-plugin/
git commit -m "chore: create plugin package structure"
```

---

### Task 6: Create plugin entry point with config hook

**Files:**
- Create: `opencode-plugin/src/index.ts`

**Interfaces:**
- Consumes: `Plugin`, `PluginInput` types from `@opencode-ai/plugin`, `loadConfig`, `emitAll`, `DEFAULT_CONFIG` from `md-merger`; bundled defaults from `defaults/agents/` directory (shipped with package)
- Produces: Named export `mdMergerPlugin` conforming to `Plugin` type; reads bundled .md defaults at runtime and merges with user config before emit

- [ ] **Step 1: Write the plugin entry**

```typescript
import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { loadConfig, emitAll, DEFAULT_CONFIG } from "md-merger";
import type { Config } from "md-merger";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Defaults are bundled in the plugin package via prepublishOnly (copies ../../defaults/ to ./defaults/)
const defaultsDir = join(__dirname, "..", "..", "defaults", "agents");

async function loadBundledDefaults(): Promise<Map<string, string>> {
  const defaults = new Map<string, string>();
  if (!existsSync(defaultsDir)) return defaults;
  // Read each .md file in defaults/agents/
  const entries = await readdir(defaultsDir);
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const agentName = entry.slice(0, -3); // strip .md
    const content = await Bun.file(join(defaultsDir, entry)).text();
    defaults.set(agentName, content);
  }
  return defaults;
}

export const mdMergerPlugin: Plugin = async (input: PluginInput) => {
  try {
    const bundledDefaults = await loadBundledDefaults();
    // NOTE: If OpenCode provides input.directory, chdir to it before calling
    // loadConfig()/emitAll() so config resolution uses the correct working context:
    // if (input.directory) process.chdir(input.directory);
    const config = await loadConfig();
    // TODO: dryRun is hard-coded to false (plugin should always emit).
    // Could be made configurable via plugin settings or input config later.
    const writtenPaths = await emitAll(config.storeFile, config.emitDirs, config, false);

    if (writtenPaths.length === 0 && bundledDefaults.size > 0) {
      console.log("[md-merger] No config found — bundled defaults available from defaults/agents/");
    }

    const agentHooks = {
      config: async (opencodeConfig: Record<string, unknown>) => {
        if (writtenPaths.length === 0) {
          console.log("[md-merger] No emitted agents found, using bundled defaults");
          // Inject bundled defaults directly into OpenCode config
          if (opencodeConfig.agent === undefined) {
            opencodeConfig.agent = {};
          }
          const agentConfig = opencodeConfig.agent as Record<string, unknown>;
          for (const [name, content] of bundledDefaults) {
            agentConfig[name] = { prompt: content };
          }
        } else {
          if (opencodeConfig.agent === undefined) {
            opencodeConfig.agent = {};
          }
        }
      },
    };

    return agentHooks;
  } catch (err) {
    console.error("[md-merger] Plugin initialization failed:", err);
    return {};
  }
};
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors (the plugin types are type-only from @opencode-ai/plugin)

- [ ] **Step 3: Commit**

```bash
git add opencode-plugin/src/index.ts
git commit -m "feat: add plugin entry with config hook"
```

---

### Task 7: Update .gitignore and verify existing tests

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing .gitignore
- Produces: Proper git exclusion for build artifacts

- [ ] **Step 1: Update .gitignore**

Add `dist/` to `.gitignore` if not already there (no-op if already present):

```
dist/
```

Note: `.npmignore` is not needed — the `files` field in `package.json` already controls npm tarball contents (`"files": ["dist/", "defaults/", "README.md"]`).

- [ ] **Step 2: Verify existing tests still pass**

Run: `bun test`
Expected: All existing tests pass — no behavior changed

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: update gitignore for build artifacts"
```

---

### Task 8: Create GitHub Actions workflows

**Files:**
- Create: `.github/workflows/md-merger-publish.yml`
- Create: `.github/workflows/opencode-plugin-publish.yml`

**Interfaces:**
- Consumes: existing repo structure
- Produces: Two separate OIDC-based publishing workflows (one per package), both triggered by `v*` tags

- [ ] **Step 1: Create root md-merger publish workflow**

```yaml
name: Publish md-merger to npm

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  publish-md-merger:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bun run bundle
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
      - run: npm publish --provenance --access public
```

- [ ] **Step 2: Create plugin publish workflow**

```yaml
name: Publish opencode-plugin to npm

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  publish-plugin:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
      - name: Replace workspace:* with semver for npm publish
        working-directory: opencode-plugin
        run: |
          node -e "const p = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
          p.dependencies['md-merger'] = '^1.0.0';
          require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');"
      - run: npm publish --provenance --access public
        working-directory: opencode-plugin
```

Note on OIDC: Neither workflow sets `NODE_AUTH_TOKEN`. The `id-token: write` permission combined with the absence of `NODE_AUTH_TOKEN` triggers GitHub Actions OIDC authentication automatically. Setting even an empty string for `NODE_AUTH_TOKEN` can prevent the OIDC handshake.

Note on workspace:*: The plugin workflow replaces `workspace:*` with `^1.0.0` in `opencode-plugin/package.json` via a dedicated step before `npm publish`. This is more reliable than depending on a `prepublishOnly` script.

- [ ] **Step 3: Verify YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/md-merger-publish.yml'))"` and same for `opencode-plugin-publish.yml` (if python available).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/
git commit -m "chore: add npm publish CI workflows (OIDC, two separate files)"
```

---

### Task 9: Create LICENSE file

**Files:**
- Create: `LICENSE`

**Interfaces:**
- Consumes: none
- Produces: MIT license file (required by spec's package.json `license` field)

- [ ] **Step 1: Verify LICENSE**

Verify `LICENSE` already exists with MIT text. If present, skip this step. If creating a new file, ensure it includes any existing attribution notices (e.g., Canopy attribution if applicable).

```
MIT License

Copyright (c) 2026 md-merger contributors

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

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "docs: add MIT license"
```

---

### Task 10: Plugin integration tests

**Files:**
- Create: `tests/unit/plugin.test.ts`

**Interfaces:**
- Consumes: `opencode-plugin/src/index.ts`, `md-merger` API
- Produces: Verification that plugin initializes without crashing

- [ ] **Step 1: Write plugin integration test**

```typescript
import { describe, expect, it, mock } from "bun:test";

// Mock md-merger module to avoid hitting the real filesystem
mock.module("md-merger", () => ({
  loadConfig: mock(async () => ({ maxInheritDepth: 5, storeFile: "prompts.jsonl", emitDirs: {}, rootDirs: [] })),
  emitAll: mock(async () => []),
  DEFAULT_CONFIG: { maxInheritDepth: 5, storeFile: "prompts.jsonl", emitDirs: {}, rootDirs: [] },
}));

describe("plugin initialization", () => {
  it("plugin exports mdMergerPlugin as an async function", async () => {
    const plugin = await import("../../opencode-plugin/src/index");
    expect(plugin.mdMergerPlugin).toBeDefined();
    expect(typeof plugin.mdMergerPlugin).toBe("function");
  });

  it("plugin returns hooks object on success", async () => {
    const plugin = await import("../../opencode-plugin/src/index");
    const hooks = await plugin.mdMergerPlugin({} as any);
    expect(hooks).toBeDefined();
    expect(typeof hooks).toBe("object");
  });
});
```

- [ ] **Step 2: Run test**

Run: `bun test tests/unit/plugin.test.ts`
Expected: PASS — plugin exports and returns hooks

- [ ] **Step 3: Commit**

```bash
git add tests/unit/plugin.test.ts
git commit -m "test: add plugin initialization tests"
```

---

### Task 11: Full build + test verification

**Files:** None new

**Interfaces:**
- Consumes: all previous tasks
- Produces: Verified build + test pass

- [ ] **Step 1: Run full build**

Run: `bun run build`
Expected: Builds to `dist/index.js`

- [ ] **Step 2: Verify bundled output**

Run: `bun ./dist/index.js --help`
Expected: Shows help output without errors
Note: Source uses Bun.file() — output still needs Bun globals even with --target node

- [ ] **Step 3: Run all tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors

- [ ] **Step 5: Verify package contents**

Run: `bun pm pack --dry-run` (or `npm pack --dry-run`)
Expected: Tarball includes `dist/`, `defaults/`, `README.md`

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "ci: verify full build + test pipeline passes"
```

---

### Task 12: Update README for npm publishing

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: existing README content
- Produces: README with npm install instructions and plugin usage guide

- [ ] **Step 1: Add sections to README**

Append these sections to the existing README:

```markdown
## Installation

### CLI
```bash
npm install -g md-merger
```

### OpenCode Plugin
Add to your `opencode.json`:
```json
{ "plugin": ["@md-merger/opencode-plugin"] }
```

## Usage

### CLI
```bash
md-merger emit
md-merger build
md-merger render
```

### OpenCode Plugin
When loaded as an OpenCode plugin, md-merger automatically:
1. Reads your config from `$MD_MERGER_CONFIG` or `.md-merger/config.yaml`
2. Resolves agent/skill inheritance
3. Registers merged agents with OpenCode's runtime

## Configuration

Place a `config.yaml` at `.md-merger/config.yaml` or set the `$MD_MERGER_CONFIG` environment variable.

```yaml
project: my-project
version: "1"
rootDirs:
  - .md-merger/agents-root/input
emitDirs:
  agent: output/agents
  skill: output/skills
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add installation and plugin usage to README"
```

---

## Plan Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Root package.json publishing metadata | `package.json` |
| 2 | tsconfig include update | `tsconfig.json` |
| 3 | Create src/api.ts public API | `src/api.ts`, `tests/unit/api.test.ts` |
| 4 | Create bundled defaults | `defaults/` tree |
| 5 | Create plugin package | `opencode-plugin/package.json` |
| 6 | Create plugin entry point | `opencode-plugin/src/index.ts` |
| 7 | Gitignore + verify existing tests | `.gitignore` |
| 8 | Create CI workflows (two separate files) | `.github/workflows/md-merger-publish.yml`, `.github/workflows/opencode-plugin-publish.yml` |
| 9 | Create LICENSE | `LICENSE` |
| 10 | Plugin integration tests | `tests/unit/plugin.test.ts` |
| 11 | Full build + test verification | — |
| 12 | Update README | `README.md` |
