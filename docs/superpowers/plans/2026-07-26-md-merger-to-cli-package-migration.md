# Package Migration: `md-merger` → `@md-merger/cli` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the root package from `md-merger` to `@md-merger/cli` to align with the scoped-plugin naming convention (`@md-merger/opencode-plugin`), while preserving the CLI command name `md-merger`.

**Architecture:** The change is a pure rename of the npm package. The `bin` entry key `"md-merger"` remains untouched, so the CLI command on PATH is unaffected. This is a search-and-replace migration across package manifests, tsconfig path aliases, CI workflows, source imports, tests, and documentation. The `.md-merger/` directory, `MD_MERGER_*` env vars, and all runtime config paths remain unchanged — those are userland config, not package names.

**Tech Stack:** TypeScript, Bun workspace monorepo, `bun:test`, npm publishing via GitHub Actions.

## Global Constraints

- **CLI command must remain `md-merger`** — the `bin` key name is unchanged
- **All user-facing config paths stay the same**: `.md-merger/`, `MD_MERGER_CONFIG` env var, `.md-merger/config.yaml`
- **Tests must pass after migration** — `bun test`
- **TypeScript must compile cleanly** — `tsc --noEmit`
- **Published package must be scoped**: npm publish uses `@md-merger/cli`
- **Plugin must import from the new package name**: `@md-merger/cli` (explicit tsconfig alias resolves to `./src/api.ts`)
- **CI must reference the correct package when waiting for publish**

---

### Task 1: Rename root `package.json` to `@md-merger/cli`

**Files:**
- Modify: `package.json:2`
- Modify: `bun.lock` (auto-regenerates)

**Interfaces:**
- Produces: New package name `@md-merger/cli` visible to workspace resolution

- [ ] **Step 1: Before-state verification — confirm current state**

Run: `node -e "const pkg = require('./package.json'); console.log(pkg.name)"`
Expected: prints `md-merger`

- [ ] **Step 2: Change the package name**

In `package.json`, line 2:
```json
- "name": "md-merger",
+ "name": "@md-merger/cli",
```

Leave the `bin` entry on line 6-8 unchanged:
```json
  "bin": {
    "md-merger": "./dist/index.js"
  },
```

- [ ] **Step 3: Reinstall workspace to regenerate bun.lock**

Run: `bun install`
Expected: `bun.lock` updates the root entry name from `md-merger` to `@md-merger/cli`. The plugin's workspace link entry also updates.

- [ ] **Step 4: Verify package name resolved correctly**

Run: `node -e "const pkg = require('./package.json'); console.log(pkg.name)"`
Expected: prints `@md-merger/cli`

- [ ] **Step 5: Verify bundle still works after rename**

Run: `bun run bundle`
Expected: Bundles successfully, no module resolution errors

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock
git commit -m "refactor: rename root package from md-merger to @md-merger/cli"
```

---

### Task 2: Update tsconfig and plugin imports together

**Files:**
- Modify: `tsconfig.json:15`
- Modify: `src/api.ts` (add re-exports of CLI functions)
- Modify: `opencode-plugin/src/index.ts:2-3`
- Modify: `opencode-plugin/package.json:8`

**Interfaces:**
- Consumes: New package name `@md-merger/cli` from Task 1
- Produces: TypeScript resolves `"@md-merger/cli"` imports via explicit tsconfig alias to `./src/api.ts`. Both plugin and CLI test imports get all needed exports.

> **Rationale:** These files must change together: the old tsconfig alias is dead without updated imports, and the imports fail without the new tsconfig alias. Changing them atomically prevents a broken intermediate state.
>
> **IMPORTANT:** An explicit `"@md-merger/cli": ["./src/api.ts"]` alias IS added. In tsconfig path resolution, exact-match aliases take priority over wildcards, so `@md-merger/cli` resolves to `./src/api.ts` — this is the SAME file for both plugin imports AND test imports. To make this work, `api.ts` gains re-exports of CLI functions (`parseCliArgs`, `run`, `CliArgs`) from `./cli`. This way a single alias serves both consumers: the plugin gets `loadConfig`/`emitAll`/`Config` and `tests/unit/cli.test.ts` gets `parseCliArgs`/`run`. The wildcard `"@md-merger/*": ["./src/*"]` remains unchanged for other `@md-merger/*` resolution.

- [ ] **Step 1: Before-state verification — verify old import names still present**

Run: `bun test tests/unit/plugin.test.ts`
Expected: PASS (this is the before-state baseline — the mock still matches the old `"md-merger"` import)

Also verify the import directly:
Run: `rg -F 'from "md-merger"' opencode-plugin/src/index.ts`
Expected: Shows matches for `from "md-merger"` imports

- [ ] **Step 2: Replace the old `"md-merger"` alias with explicit `"@md-merger/cli"` alias**

In `tsconfig.json`, line 15:
```json
- "md-merger": ["./src/api.ts"]
+ "@md-merger/cli": ["./src/api.ts"]
```

This explicit alias takes priority over the wildcard `"@md-merger/*": ["./src/*"]` for imports of `@md-merger/cli`, ensuring they resolve to `./src/api.ts` (which now re-exports everything needed). The wildcard remains for other `@md-merger/*` resolution.

- [ ] **Step 3: Update `api.ts` to re-export CLI functions**

In `src/api.ts`, add re-exports of the CLI module at the end of the file:
```ts
// src/api.ts — public library API surface for @md-merger/opencode-plugin

export { loadConfig, getConfigPath } from "./config";
export { emitAll } from "./emit";
export type { Config } from "./types";
export { DEFAULT_CONFIG, DEFAULT_MAX_INHERIT_DEPTH } from "./types";
+ export { parseCliArgs, run, type CliArgs } from "./cli";
```

This ensures that `@md-merger/cli` (resolving to `api.ts`) provides BOTH the API surface (`loadConfig`, `emitAll`, `Config`) AND the CLI functions (`parseCliArgs`, `run`, `CliArgs`) needed by `tests/unit/cli.test.ts`.

- [ ] **Step 4: Update plugin source imports**

In `opencode-plugin/src/index.ts`, lines 2-3:
```ts
- import { loadConfig, emitAll } from "md-merger";
- import type { Config } from "md-merger";
+ import { loadConfig, emitAll } from "@md-merger/cli";
+ import type { Config } from "@md-merger/cli";
```

Note: `@md-merger/cli` resolves via the explicit tsconfig alias to `./src/api.ts`.

- [ ] **Step 5: Update plugin workspace dependency and prepublishOnly script**

In `opencode-plugin/package.json`, line 8:
```json
- "md-merger": "workspace:*",
+ "@md-merger/cli": "workspace:*",
```

Also update the `prepublishOnly` script to use the new dependency key `'@md-merger/cli'` instead of `'md-merger'`:
```js
- p.dependencies['md-merger'] = ...
+ p.dependencies['@md-merger/cli'] = ...
```

- [ ] **Step 6: Reinstall to update workspace links**

Run: `bun install`
Expected: Workspace lock updates to reference `@md-merger/cli` instead of `md-merger`.

- [ ] **Step 7: Type-check the entire project**

Run: `bunx tsc --noEmit`
Expected: 0 compilation errors. The explicit `"@md-merger/cli"` alias resolves to `./src/api.ts` (exact match priority). `api.ts` now re-exports both API functions (`loadConfig`, `emitAll`, `Config`) and CLI functions (`parseCliArgs`, `run`, `CliArgs`), satisfying both plugin imports and `tests/unit/cli.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json src/api.ts opencode-plugin/package.json opencode-plugin/src/index.ts
git commit -m "refactor: replace md-merger tsconfig alias with @md-merger/cli, re-export CLI functions from api.ts, update plugin imports and dependency"
```

---

### Task 3: Update plugin test mock

**Files:**
- Modify: `tests/unit/plugin.test.ts:4`

**Interfaces:**
- Consumes: Updated plugin imports from Task 2

- [ ] **Step 1: Update the mock module name**

In `tests/unit/plugin.test.ts`, line 4:
```ts
// Mock @md-merger/cli module to avoid hitting the real filesystem
mock.module("@md-merger/cli", () => ({
```

- [ ] **Step 2: Run the plugin tests**

Run: `bun test tests/unit/plugin.test.ts`
Expected: PASS — mock for `@md-merger/cli` matches the import in `opencode-plugin/src/index.ts`

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass. `tests/unit/cli.test.ts` works via explicit alias `@md-merger/cli` → `./src/api.ts` (which re-exports `parseCliArgs`/`run` from `./cli`).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/plugin.test.ts
git commit -m "test: update plugin mock from md-merger to @md-merger/cli"
```

---

### Task 4: Update CI workflows

**Files:**
- Modify: `.github/workflows/md-merger-publish.yml`
- Modify: `.github/workflows/opencode-plugin-publish.yml`

**Interfaces:**
- Consumes: New package name `@md-merger/cli` from Task 1

- [ ] **Step 1: Update md-merger-publish.yml**

In `.github/workflows/md-merger-publish.yml`:

Line 1 — workflow name:
```yaml
- name: Publish md-merger to npm
+ name: Publish @md-merger/cli to npm
```

Line 14 — job ID:
```yaml
- publish-md-merger:
+ publish-cli:
```

- [ ] **Step 2: Update opencode-plugin-publish.yml**

In `.github/workflows/opencode-plugin-publish.yml`:

Line 28 — step name:
```yaml
- name: Wait for md-merger to be published
+ name: Wait for @md-merger/cli to be published
```

Line 31 — the `npm view` command:
```bash
-             if npm view md-merger@$MD_MERGER_VERSION version >/dev/null 2>&1; then
+             if npm view @md-merger/cli@$MD_MERGER_VERSION version >/dev/null 2>&1; then
```

Line 32 — echo message:
```bash
-               echo "md-merger@$MD_MERGER_VERSION is available"
+               echo "@md-merger/cli@$MD_MERGER_VERSION is available"
```

Line 35 — waiting message:
```bash
-             echo "Waiting for md-merger to publish... attempt $i/10"
+             echo "Waiting for @md-merger/cli to publish... attempt $i/10"
```

Line 38 — error message:
```bash
-           echo "ERROR: md-merger failed to publish within 5 minutes"
+           echo "ERROR: @md-merger/cli failed to publish within 5 minutes"
```

Line 48 — the `p.dependencies` replacement key (add defensive delete of old key):
```js
- p.dependencies['md-merger'] = '^' + process.env.MD_MERGER_VERSION;
+ delete p.dependencies['md-merger'];
+ p.dependencies['@md-merger/cli'] = '^' + process.env.MD_MERGER_VERSION;
```

- [ ] **Step 3: Before-state verification — validate workflow YAML files readable**

Run: `node -e "const fs = require('fs'); require('fs').readFileSync('.github/workflows/md-merger-publish.yml', 'utf8'); require('fs').readFileSync('.github/workflows/opencode-plugin-publish.yml', 'utf8'); console.log('YAML files readable')" `

For YAML syntax validation:
```bash
node -e "const fs=require('fs'); const yaml=require('js-yaml'); yaml.load(fs.readFileSync('.github/workflows/md-merger-publish.yml','utf8')); yaml.load(fs.readFileSync('.github/workflows/opencode-plugin-publish.yml','utf8')); console.log('YAML valid')" 2>/dev/null || echo "Install js-yaml first: bun add -d js-yaml"
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/md-merger-publish.yml .github/workflows/opencode-plugin-publish.yml
git commit -m "refactor: update CI workflows for @md-merger/cli package name"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `README.md` (package name references as npm package)
- Modify: `docs/superpowers/plans/2026-07-24-md-merger-deployment.md`
- Modify: `docs/superpowers/specs/2026-07-24-md-merger-deployment-design.md`
- Scan: `.slim/deepwork/md-merger-deployment.md`
- No change: `LICENSE` (see note below)

**Interfaces:**
- No runtime/code changes — documentation only

> **Note on LICENSE:** The `LICENSE` file contains `Copyright (c) 2026 md-merger contributors`. Leave this as-is — `md-merger` here is a project/copyright name, not an npm package name. No change needed.
>
> - Note: Also scan `.slim/deepwork/md-merger-deployment.md` for any npm package name references and update if needed.

**Naming boundaries for this task:**
- CHANGE: `"md-merger"` when it appears as the npm **package name** (in `package.json` examples, `npm install` commands, import statements in docs, `dependencies` entries)
- KEEP as `md-merger`: CLI command usage (`md-merger build`, `md-merger emit`, `md-merger render`)
- KEEP as `md-merger`: directory name (`.md-merger/`), env var names (`MD_MERGER_CONFIG`), and project/file names that aren't the npm package

- [ ] **Step 1: Update README.md installation command**

In `README.md`, line 65:
```md
- npm install -g md-merger
+ npm install -g @md-merger/cli
```

Also scan for `"md-merger"` appearing as a **package name in code blocks** and update:
- `"name": "md-merger"` → `"name": "@md-merger/cli"`
- `dependencies: { "md-merger": "..." }` → `dependencies: { "@md-merger/cli": "..." }`
- `import ... from "md-merger"` → `import ... from "@md-merger/cli"`

- [ ] **Step 2: Update deployment plan doc**

In `docs/superpowers/plans/2026-07-24-md-merger-deployment.md`:
- Package name references: `md-merger` → `@md-merger/cli` (in architecture description and Task definitions where it refers to the npm package)
- Keep CLI command references: `md-merger build`, `md-merger emit`, etc.
- Keep directory/env var references: `.md-merger/`, `MD_MERGER_CONFIG`

- [ ] **Step 3: Update design spec doc**

In `docs/superpowers/specs/2026-07-24-md-merger-deployment-design.md`:
- Same pattern — package name references only
- Keep all CLI command, directory, and env var references unchanged

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/plans/2026-07-24-md-merger-deployment.md docs/superpowers/specs/2026-07-24-md-merger-deployment-design.md
git commit -m "docs: update package name references from md-merger to @md-merger/cli"
```

---

### Task 6: Final verification sweep

**Files:** All

**Interfaces:**
- Consumes: All previous tasks completed

- [ ] **Step 1: Final verification — run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 2: Final verification — type-check entire project**

Run: `bunx tsc --noEmit`
Expected: 0 compilation errors

- [ ] **Step 3: Verify CLI command name still works**

Run: `bun run bundle && node dist/index.js --help`
Expected: Prints CLI help with `Usage: md-merger <command>`

- [ ] **Step 4: Search for any remaining `"md-merger"` used as import/dependency**

Run: `rg --type ts --type json --fixed-strings '"md-merger"' --glob '!**/bun.lock' --glob '!**/node_modules' --glob '!**/CHANGELOG*'`

This should return **no results** for `"md-merger"` appearing as an import source or dependency key.

It's fine to STILL see:
- `package.json` → `"bin": { "md-merger": ... }` — CLI command name, correct
- `bun.lock` — auto-generated, correct
- String literals like `"Usage: md-merger ..."` — CLI help text, correct
- `.md-merger/` directory paths — config, correct
- `MD_MERGER_*` env vars — correct
- README/Docs references to CLI commands — correct

Any `"md-merger"` remaining as an `import` from clause or a `dependencies` key is a bug — fix before committing.

- [ ] **Step 5: Search for any remaining `from "md-merger"` or `from 'md-merger'` imports**

Run: `rg --type ts "from [\"']md-merger"`
Expected: 0 results

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify and finalize @md-merger/cli package migration"
```

---

## Self-Review

### Spec Coverage
- [x] Package name in root `package.json` — Task 1
- [x] tsconfig path alias — Task 2
- [x] Plugin workspace dependency — Task 2
- [x] Plugin source imports — Task 2
- [x] Plugin test mock — Task 3
- [x] CI workflows — Task 4
- [x] Documentation — Task 5
- [x] CLI command preserved — verified Task 1, Task 6
- [x] User config paths unchanged — not modified anywhere
- [x] TDD — tests run before and after each change
- [x] Frequent commits — each task ends with a commit

### Placeholder Scan
No TBD, TODO, or vague instructions. All code blocks contain specific before/after diffs. All commands include expected output.

### Type/Name Consistency
- Package name: `@md-merger/cli` used consistently across all tasks
- CLI command name: `md-merger` preserved in all user-facing contexts
- Config paths: `.md-merger/`, `MD_MERGER_CONFIG` left untouched throughout
- No conflicting names between tasks
