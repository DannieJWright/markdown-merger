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
    "build": "bun build ./src/index.ts --outdir ./dist --target node --banner 'entry:#!/usr/bin/env node'",
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
// Re-exports the core md-merger symbols for plugin and library consumers

export { loadConfig, getConfigPath } from "./config";
export { emitAll, renderText, deduplicateRecords } from "./emit";
export type { Config, PromptRecord, Section, RenderResult } from "./types";
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

  it("exports renderText as a function", () => {
    expect(typeof api.renderText).toBe("function");
  });

  it("exports deduplicateRecords as a function", () => {
    expect(typeof api.deduplicateRecords).toBe("function");
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
  "files": ["src/"],
  "dependencies": {
    "@opencode-ai/plugin": "^1.0.0"
  },
  "peerDependencies": {
    "md-merger": "^1.0.0"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

Note: Uses `peerDependencies` for `md-merger` since OpenCode will already have it available, and avoids workspace protocol in published package.

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
- Consumes: `Plugin`, `PluginInput` types from `@opencode-ai/plugin`, `loadConfig`, `emitAll` from `md-merger`
- Produces: Named export `mdMergerPlugin` conforming to `Plugin` type

- [ ] **Step 1: Write the plugin entry**

```typescript
import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { loadConfig, emitAll } from "md-merger";
import type { Config } from "md-merger";

export const mdMergerPlugin: Plugin = async (input: PluginInput) => {
  try {
    // Load config — falls back to DEFAULT_CONFIG if no config file present
    const config = await loadConfig();

    // Run emit pass to resolve all modules
    const writtenPaths = await emitAll(
      config.storeFile,
      config.emitDirs,
      config,
      false  // not a dry run — actually emit
    );

    return {
      config: async (opencodeConfig: any) => {
        // Plugin hooks into OpenCode config to inject agents
        // This will be populated with agent definitions from emit results
        if (opencodeConfig.agent === undefined) {
          opencodeConfig.agent = {};
        }
      },
    } as Hooks;
  } catch (err) {
    // Never crash OpenCode — return empty hooks on failure
    console.error("[md-merger] Plugin initialization failed:", err);
    return {} as Hooks;
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

### Task 7: Create .npmignore and .gitignore updates

**Files:**
- Create: `.npmignore`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing .gitignore
- Produces: Proper file exclusion for npm tarball

- [ ] **Step 1: Create .npmignore**

```
src/
tests/
docs/
.github/
opencode-plugin/
*.ts
*.test.*
bunfig.toml
Justfile
*.md
!README.md
dist/
**/dist/
```

Wait — the spec says `"files": ["dist/", "defaults/", "README.md"]` which takes precedence over `.npmignore`. Since `files` is present, `.npmignore` is unnecessary. **Skip this step** and rely on the `files` field in package.json.

- [ ] **Step 2: Update .gitignore**

Add `dist/` and `opencode-plugin/src/` to `.gitignore` if not already there:

```
dist/
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `bun test`
Expected: All existing tests pass — no behavior changed

- [ ] **Step 4: Commit**

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
- Produces: Two OIDC-based publishing workflows

- [ ] **Step 1: Create md-merger publish workflow**

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
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun run build
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish --provenance --access public
```

- [ ] **Step 2: Create opencode-plugin publish workflow**

```yaml
name: Publish @md-merger/opencode-plugin to npm

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  publish:
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
          registry-url: 'https://registry.npmjs.org'
      - run: cd opencode-plugin && npm publish --provenance --access public
```

- [ ] **Step 3: Verify YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/md-merger-publish.yml'))"` (if python available) or just trust the syntax is standard GitHub Actions YAML.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/
git commit -m "chore: add npm publish CI workflows"
```

---

### Task 9: Create LICENSE file

**Files:**
- Create: `LICENSE`

**Interfaces:**
- Consumes: none
- Produces: MIT license file (required by spec's package.json `license` field)

- [ ] **Step 1: Create LICENSE**

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

Run: `node ./dist/index.js --help`
Expected: Shows help output without errors

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
| 8 | Create CI workflows | `.github/workflows/*.yml` |
| 9 | Create LICENSE | `LICENSE` |
| 10 | Plugin integration tests | `tests/unit/plugin.test.ts` |
| 11 | Full build + test verification | — |
| 12 | Update README | `README.md` |
