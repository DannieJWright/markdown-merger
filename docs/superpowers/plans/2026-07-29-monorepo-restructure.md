# Monorepo Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repository so `@md-merger/cli` and `@md-merger/opencode-plugin` are proper Bun workspace members under `packages/`, fixing the workspace resolution error.

**Architecture:** Private root container with `packages/*` as workspace glob. CLI moved to `packages/cli/`, plugin moved to `packages/opencode-plugin/`. All source, tests, and config updated to new paths.

**Tech Stack:** Bun 1.3.14, TypeScript 7.0.2, npm 11.x

## Global Constraints

- Use `git mv` for all file moves to preserve git history
- Use `bun test` for test execution
- Use `bun run typecheck` for type checking
- Project root: `C:\Users\Danni\Documents\Git\evo-ai`
- Bun workspace pattern: `"workspaces": ["packages/*"]`
- Tests must use `bun:test` module
- TDD: verify tests pass after each structural change before proceeding

---

### Task 1: Create packages/cli/ directory structure

**Files:**
- Create: `packages/cli/` directory

- [ ] **Step 1: Create the packages/cli directory**

```bash
mkdir packages/cli
```

- [ ] **Step 2: Move src/ to packages/cli/src/ using git mv**

```bash
git mv src packages/cli/src
```

Verify with: `ls packages/cli/src/` should show `api.ts cli.ts config.ts emit.ts frontmatter.ts import.ts index.ts resolve.ts store.ts types.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src
git commit -m "refactor: move src/ to packages/cli/src/"
```

---

### Task 2: Create packages/cli/package.json

**Files:**
- Create: `packages/cli/package.json`
- Modify: root `package.json`

- [ ] **Step 1: Create packages/cli/package.json with all CLI config from root**

```json
{
  "name": "@md-merger/cli",
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
  "files": [
    "dist/",
    "defaults/",
    "src/",
    "README.md"
  ],
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
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
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "node -e \"require('child_process').execSync('bun run bundle', {stdio: 'inherit'})\""
  }
}
```

- [ ] **Step 2: Update root package.json to become private container**

```json
{
  "name": "@md-merger/monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "devDependencies": {
    "@types/node": "^26.1.1",
    "bun-types": "^1.3.14",
    "typescript": "^7.0.2"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/package.json package.json
git commit -m "refactor: create packages/cli/package.json, make root private monorepo root"
```

---

### Task 3: Move defaults/ to packages/cli/defaults/

**Files:**
- Move: `defaults/` → `packages/cli/defaults/`

- [ ] **Step 1: Move defaults directory using git mv**

```bash
git mv defaults packages/cli/defaults
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/defaults
git commit -m "refactor: move defaults/ to packages/cli/defaults/"
```

Note: The opencode-plugin's `prepublishOnly` defaults path will be updated in Task 4 after the plugin is moved to `packages/opencode-plugin/`.

---

### Task 4: Move opencode-plugin to packages/opencode-plugin/

**Files:**
- Move: `opencode-plugin/` → `packages/opencode-plugin/`

- [ ] **Step 1: Move opencode-plugin directory using git mv**

```bash
git mv opencode-plugin packages/opencode-plugin
```

- [ ] **Step 2: Update plugin prepublishOnly script path** — the `../defaults` path becomes `../../cli/defaults`

Modify `packages/opencode-plugin/package.json` line 12 — three changes:
1. Move path: `../defaults` → `../../cli/defaults` (from `packages/opencode-plugin/`, two levels up to `packages/`, then `cli/defaults/`)
```json
"prepublishOnly": "node -e \"const p=require('./package.json'); p.dependencies['@md-merger/cli']='^' + p.version; require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2)+'\n'); const {cpSync, existsSync} = require('fs'); if (existsSync('../../cli/defaults')) cpSync('../../cli/defaults', './defaults', {recursive:true}); else console.warn('defaults/ not found - skip copy')\""
```

- [ ] **Step 3: Commit**

```bash
git add packages/opencode-plugin
git commit -m "refactor: move opencode-plugin to packages/opencode-plugin/, fix prepublishOnly defaults path"
```

---

### Task 5: Move tests to their respective packages

**Files:**
- Move: `tests/unit/api.test.ts` → `packages/cli/tests/unit/api.test.ts`
- Move: `tests/unit/cli.test.ts` → `packages/cli/tests/unit/cli.test.ts`
- Move: `tests/unit/config.test.ts` → `packages/cli/tests/unit/config.test.ts`
- Move: `tests/unit/emit.test.ts` → `packages/cli/tests/unit/emit.test.ts`
- Move: `tests/unit/frontmatter.test.ts` → `packages/cli/tests/unit/frontmatter.test.ts`
- Move: `tests/unit/import.test.ts` → `packages/cli/tests/unit/import.test.ts`
- Move: `tests/unit/resolve.test.ts` → `packages/cli/tests/unit/resolve.test.ts`
- Move: `tests/unit/store.test.ts` → `packages/cli/tests/unit/store.test.ts`
- Move: `tests/e2e/e2e.test.ts` → `packages/cli/tests/e2e/e2e.test.ts`
- Move: `tests/resources/` → `packages/cli/tests/resources/`
- Move: `tests/unit/plugin.test.ts` → `packages/opencode-plugin/tests/plugin.test.ts`

- [ ] **Step 1: Create test directory structure**

```bash
mkdir packages/cli/tests/unit
mkdir packages/cli/tests/e2e
mkdir packages/opencode-plugin/tests
```

- [ ] **Step 2: Move CLI tests using git mv**

```bash
git mv tests/unit/api.test.ts packages/cli/tests/unit/api.test.ts
git mv tests/unit/cli.test.ts packages/cli/tests/unit/cli.test.ts
git mv tests/unit/config.test.ts packages/cli/tests/unit/config.test.ts
git mv tests/unit/emit.test.ts packages/cli/tests/unit/emit.test.ts
git mv tests/unit/frontmatter.test.ts packages/cli/tests/unit/frontmatter.test.ts
git mv tests/unit/import.test.ts packages/cli/tests/unit/import.test.ts
git mv tests/unit/resolve.test.ts packages/cli/tests/unit/resolve.test.ts
git mv tests/unit/store.test.ts packages/cli/tests/unit/store.test.ts
git mv tests/e2e/e2e.test.ts packages/cli/tests/e2e/e2e.test.ts
git mv tests/resources packages/cli/tests/resources
```

- [ ] **Step 3: Move plugin test**

```bash
git mv tests/unit/plugin.test.ts packages/opencode-plugin/tests/plugin.test.ts
```

- [ ] **Step 4: Remove empty tests directory**

```bash
rmdir tests/unit
rmdir tests/e2e 2>nul
rmdir tests 2>nul
```

If `rmdir` fails due to leftover files (like `.gitkeep` or `build/`), clean those up.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/tests packages/opencode-plugin/tests
git commit -m "refactor: move tests to their respective packages"
```

---

### Task 6: Update test import paths

**Files:**
- Modify: `packages/cli/tests/unit/api.test.ts`
- Modify: `packages/cli/tests/e2e/e2e.test.ts`
- Modify: `packages/opencode-plugin/tests/plugin.test.ts`

- [ ] **Step 1: Verify api.test.ts imports are correct** — no change needed

The existing `"../../src/api"` import from `packages/cli/tests/unit/api.test.ts` correctly resolves to `packages/cli/src/api.ts` after the move. No modification required.

- [ ] **Step 2: Verify e2e.test.ts imports are correct** — no import change needed

The existing `"../../src/cli"` and `"../../src/config"` imports from `packages/cli/tests/e2e/e2e.test.ts` correctly resolve to `packages/cli/src/cli.ts` and `packages/cli/src/config.ts` after the move. No modification required.

- [ ] **Step 2b: Update e2e.test.ts hardcoded paths** — `PROJECT_ROOT` needs 4 dots; fix `SCENARIO_ROOT` AND `BUILD_DIR`

File: `packages/cli/tests/e2e/e2e.test.ts` — update all three path constants:

```typescript
const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const SCENARIO_ROOT = resolve(PROJECT_ROOT, "packages", "cli", "tests", "resources", "agents-root");
const BUILD_DIR = resolve(PROJECT_ROOT, "packages", "cli", "tests", "build");
```

Note: The old `BUILD_DIR` would resolve to `evo-ai/tests/build/` (nonexistent after restructure). It must point to `packages/cli/tests/build/`.

- [ ] **Step 3: Update plugin.test.ts imports** — change `"../../opencode-plugin/src/index"` → `"../src/index"`

File: `packages/opencode-plugin/tests/plugin.test.ts` lines 12 and 18:
```typescript
const plugin = await import("../../opencode-plugin/src/index");
```
Change to:
```typescript
const plugin = await import("../src/index");
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/tests packages/opencode-plugin/tests
git commit -m "refactor: update test import paths for new directory structure"
```

---

### Task 7: Update tsconfig.json paths

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Update tsconfig.json**

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
    "types": ["node", "bun-types"],
    "paths": {
      "@md-merger/*": ["./packages/cli/src/*"],
      "@md-merger/cli": ["./packages/cli/src/api.ts"]
    }
  },
  "include": ["packages/cli/src/**/*.ts", "packages/cli/tests/**/*.ts", "packages/opencode-plugin/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.json
git commit -m "refactor: update tsconfig.json paths for new workspace structure"
```

---

### Task 8: Update Justfile paths

**Files:**
- Modify: `Justfile`

- [ ] **Step 1: Update Justfile** — change `./src/index.ts` → `./packages/cli/src/index.ts`

```justfile
build:
    bun ./packages/cli/src/index.ts build

emit *args:
    bun ./packages/cli/src/index.ts emit {{args}}

render args:
    bun ./packages/cli/src/index.ts render {{args}}

doctor:
    bun ./packages/cli/src/index.ts doctor

stats:
    bun ./packages/cli/src/index.ts stats

test:
    bun test

typecheck:
    bun run typecheck
```

- [ ] **Step 2: Commit**

```bash
git add Justfile
git commit -m "refactor: update Justfile paths for new workspace structure"
```

---

### Task 9: Verify bun install, test, and typecheck

**Verification only — no file changes.**

- [ ] **Step 1: Clean install**

```bash
rm -rf node_modules packages/cli/node_modules packages/opencode-plugin/node_modules
bun install
```

Expected: **SUCCESS** — no workspace resolution errors. Verify with `bun pm ls` that both `@md-merger/cli` and `@md-merger/opencode-plugin` appear as workspace members.

- [ ] **Step 2: Run bundle**

```bash
cd packages/cli && bun run bundle
```

Expected: **SUCCESS** — `packages/cli/dist/index.js` created with Node.js shebang.

- [ ] **Step 3: Run tests**

```bash
cd packages/cli && bun test
```

Expected: **SUCCESS** — all CLI tests pass.

- [ ] **Step 4: Run plugin tests**

```bash
cd packages/opencode-plugin && bun test
```

Expected: **SUCCESS** — plugin test passes.

- [ ] **Step 5: Type check**

```bash
bun run typecheck
```

Expected: **SUCCESS** — no type errors.

- [ ] **Step 6: Commit (if all pass)**

```bash
git add -A
git commit -m "refactor: verify bun install, test, typecheck all pass with new structure"
```

If any step fails, investigate and fix before proceeding. This is the critical Phase 1 gate.

---

### Task 10: Update md-merger-publish.yml workflow

**Files:**
- Modify: `.github/workflows/md-merger-publish.yml`

- [ ] **Step 1: Add working-directory to CLI workflow**

```yaml
name: Publish @md-merger/cli to npm

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  publish-cli:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
        # Runs at workspace root for workspace resolution — do NOT set working-directory
      - run: bun run bundle
        working-directory: packages/cli
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
      - run: npm publish --provenance --access public
        working-directory: packages/cli
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/md-merger-publish.yml
git commit -m "ci: update md-merger publish workflow for new packages/cli path"
```

---

### Task 11: Update opencode-plugin-publish.yml workflow

**Files:**
- Modify: `.github/workflows/opencode-plugin-publish.yml`

- [ ] **Step 1: Update all working-directory references**

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
        # Runs at workspace root for workspace resolution — do NOT set working-directory
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
      - name: Extract version without v prefix
        id: version
        run: echo "VERSION=$(echo ${{ github.ref_name }} | sed 's/^v//')" >> $GITHUB_OUTPUT
      - name: Wait for @md-merger/cli to be published
        run: |
          for i in $(seq 1 10); do
            if npm view @md-merger/cli@$MD_MERGER_VERSION version >/dev/null 2>&1; then
              echo "@md-merger/cli@$MD_MERGER_VERSION is available"
              exit 0
            fi
            echo "Waiting for @md-merger/cli to publish... attempt $i/10"
            sleep 30
          done
          echo "ERROR: @md-merger/cli failed to publish within 5 minutes"
          exit 1
        env:
          MD_MERGER_VERSION: ${{ steps.version.outputs.VERSION }}
      - name: Replace workspace:* with semver for npm publish
        working-directory: packages/opencode-plugin
        env:
          MD_MERGER_VERSION: ${{ steps.version.outputs.VERSION }}
        run: |
          node -e "const p = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
          p.dependencies['@md-merger/cli'] = '^' + process.env.MD_MERGER_VERSION;
          require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');"
      - run: npm publish --provenance --access public
        working-directory: packages/opencode-plugin
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/opencode-plugin-publish.yml
git commit -m "ci: update opencode-plugin publish workflow for new packages/opencode-plugin path"
```

---

### Task 12: Final verification and git history cleanup

**Verification only — cleanup if needed.**

- [ ] **Step 1: Verify yarn.lock / bun.lock still valid**

```bash
bun install
```

Expected: **SUCCESS** — lockfile still resolves.

- [ ] **Step 2: Verify .gitignore entries are still correct**

Check that `node_modules/`, `dist/`, `tests/build/` are still excluded. If `tests/build/` is now under `packages/cli/tests/build/`, update `.gitignore`:
```gitignore
# Test output
packages/cli/tests/build/
```

- [ ] **Step 3: Run full test + typecheck one final time**

```bash
bun run typecheck
bun test
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "refactor: monorepo structure complete — cli and plugin under packages/"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Root package.json becomes private container (Task 2)
- [x] packages/cli/package.json created (Task 2)
- [x] Source files moved to packages/cli/src/ (Task 1)
- [x] defaults/ moved to packages/cli/defaults/ (Task 3)
- [x] CLI tests moved to packages/cli/tests/ (Task 5)
- [x] Plugin test moved to packages/opencode-plugin/tests/ (Task 5)
- [x] api.test.ts & e2e.test.ts imports verified correct (Task 6)
- [x] e2e.test.ts BUILD_DIR path fixed (Task 6)
- [x] tsconfig.json updated (Task 7)
- [x] Justfile updated (Task 8)
- [x] bun install + test + typecheck verification (Task 9)
- [x] CI workflows updated (Tasks 10-11)
- [x] CI workflows bun install at workspace root (Tasks 10-11)
- [x] Final verification (Task 12)

**Placeholder scan:** No TBDs, TODOs, or vague steps found.

**Type consistency:** All test import path changes match new directory structure. `@md-merger/*` alias maps to `./packages/cli/src/*` consistently.

---
