# Rebrand: evo-ai → md-merger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all branding from `evo-ai` to `md-merger` across the entire codebase with zero behavior change.

**Architecture:** Pure mechanical find-and-replace across four layers (package config → source → tests → docs). Each task covers one layer. Existing 104 tests serve as regression safety net — no new tests needed.

**Tech Stack:** TypeScript, Bun, zero dependencies.

## Global Constraints

- **Naming mapping:** `evo-ai` → `md-merger` | `@evo/*` → `@md-merger/*` | `.evo/` → `.md-merger/` | `EVO_CONFIG` → `MD_MERGER_CONFIG` | `evo` CLI → `md-merger`
- **No behavior changes** — this is a mechanical rename only
- **All 104 existing tests must pass** after each task that touches code or tests
- **TypeScript must compile clean** after each task: `tsc --noEmit`
- **Use `ast_grep_replace`** for pattern-based replacements to avoid partial matches or typos
- **Commit convention:** `chore: rebrand <layer> from evo-ai to md-merger`
- **Git:** Series of commits per task, to be squashed on merge into main
- **DO NOT touch:** `.slim/deepwork/` files, `node_modules/`, `dist/`, `Temp/`, `models/`, `.superpowers/`

---

### Task 1: Rebrand Package & Configuration Files

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Modify: `Justfile`
- Modify: `LICENSE`

**Interfaces:**
- Consumes: Nothing (first task)
- Produces: Updated config files so subsequent tasks see correct paths and aliases

- [x] **Step 1: Replace `evo-ai` with `md-merger` in `package.json`**

  In `package.json`:
  - `"name": "evo-ai"` → `"name": "md-merger"`
  - `"evo": "./src/index.ts"` → `"md-merger": "./src/index.ts"`

- [x] **Step 2: Replace `@evo/*` with `@md-merger/*` in `tsconfig.json`**

  In `tsconfig.json`:
  - `"@evo/*": ["./src/*"]` → `"@md-merger/*": ["./src/*"]`

- [x] **Step 3: Replace `.evo/` with `.md-merger/` in `.gitignore`**

  In `.gitignore`:
  - `.evo/` → `.md-merger/`

- [x] **Step 4: Replace `evo-ai` and `.evo` references in `Justfile`**

  In `Justfile`:
  - All occurrences of `evo-ai` → `md-merger`
  - All occurrences of `.evo` → `.md-merger`

- [x] **Step 5: Replace `evo-ai` with `md-merger` in `LICENSE`**

  In `LICENSE`:
  - `evo-ai contributors` → `md-merger contributors`

- [x] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore Justfile LICENSE
git commit -m "chore: rebrand package config from evo-ai to md-merger"
```

---

### Task 2: Rebrand Source Code

**Files:**
- Modify: `src/config.ts`
- Modify: `src/cli.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: Updated `tsconfig.json` path alias from Task 1
- Produces: Source files referencing new env var name, config path, and defaults

- [ ] **Step 1: Replace env var and path references in `src/config.ts`**

  In `src/config.ts`:
  - `process.env.EVO_CONFIG` → `process.env.MD_MERGER_CONFIG`
  - `".evo/config.yaml"` → `".md-merger/config.yaml"`

- [ ] **Step 2: Replace all branding strings in `src/cli.ts`**

  In `src/cli.ts`:
  - `process.env.EVO_CONFIG` → `process.env.MD_MERGER_CONFIG` (line 92)
  - `.evo/config.yaml` → `.md-merger/config.yaml` (line 114)
  - `"Usage: evo render <module>"` → `"Usage: md-merger render <module>"` (line 47)
  - `"Usage: evo config [show|set|unset]"` → `"Usage: md-merger config [show|set|unset]"` (line 98)
  - `Usage: evo <command>` → `Usage: md-merger <command>` (line 103, inside template literal)

- [ ] **Step 3: Replace default path in `src/types.ts`**

  In `src/types.ts`:
  - `".evo/agents-root/input"` → `".md-merger/agents-root/input"`

- [ ] **Step 4: Skip verification**

  Both `tsc --noEmit` and `bun test` will fail at this point because `tsconfig.json` now maps `@md-merger/*` but test imports still say `@evo/*`. This is expected and intentional — Task 3 fixes both the test imports and source references together so they compile in sync. Move directly to Step 5.

  **Note (exception to global constraint):** The "all 104 tests must pass after each task" rule intentionally does not apply here. Tests *cannot* pass between Task 2 and Task 3 because the tsconfig path alias has changed (`@evo/*` → `@md-merger/*`) while the test import statements have not yet been updated. This is a known, expected break — both sides are corrected atomically in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/cli.ts src/types.ts
git commit -m "chore: rebrand source code from evo-ai to md-merger"
```

---

### Task 3: Rebrand Tests & Fixtures

**Files:**
- Modify: `tests/unit/cli.test.ts`
- Modify: `tests/unit/config.test.ts`
- Modify: `tests/unit/frontmatter.test.ts`
- Modify: `tests/unit/emit.test.ts`
- Modify: `tests/unit/store.test.ts`
- Modify: `tests/unit/import.test.ts`
- Modify: `tests/unit/resolve.test.ts`
- Modify: `tests/e2e/e2e.test.ts`
- Modify: `tests/resources/agents-root/config.yaml`

**Interfaces:**
- Consumes: Updated tsconfig path alias from Task 1, updated source code from Task 2
- Produces: All tests passing with new naming

- [ ] **Step 1: Replace `@evo/*` imports with `@md-merger/*` in all test files**

  In each test file, replace all import paths:
  - `from "@evo/cli"` → `from "@md-merger/cli"`
  - `from "@evo/config"` → `from "@md-merger/config"`
  - `from "@evo/frontmatter"` → `from "@md-merger/frontmatter"`
  - `from "@evo/emit"` → `from "@md-merger/emit"`
  - `from "@evo/store"` → `from "@md-merger/store"`
  - `from "@evo/import"` → `from "@md-merger/import"`
  - `from "@evo/resolve"` → `from "@md-merger/resolve"`
  - `from "@evo/types"` → `from "@md-merger/types"`

- [ ] **Step 2: Replace env var, path, and assertion references in test files**

  The bulk find-and-replace will naturally update test description strings (e.g., `"uses EVO_CONFIG env var when set"` → `"uses MD_MERGER_CONFIG env var when set"`, `"defaults to .evo/config.yaml"` → `"defaults to .md-merger/config.yaml"`). This is correct and expected — description strings should reflect the renamed identifiers.

  In `tests/unit/config.test.ts`:
  - All `process.env.EVO_CONFIG` → `process.env.MD_MERGER_CONFIG`
  - All `EVO_CONFIG` → `MD_MERGER_CONFIG`
  - `".evo/config.yaml"` → `".md-merger/config.yaml"`
  - `"evo-ai"` → `"md-merger"` (in expectations)
  - Test description strings will be updated automatically by the above replacements

  In `tests/unit/cli.test.ts`:
  - All `process.env.EVO_CONFIG` → `process.env.MD_MERGER_CONFIG`
  - `"Usage: evo render <module>"` → `"Usage: md-merger render <module>"` (line 54 test assertion)

  In `tests/e2e/e2e.test.ts`:
  - All `process.env.EVO_CONFIG` → `process.env.MD_MERGER_CONFIG`

  In `tests/resources/agents-root/config.yaml`:
  - `project: evo-ai` → `project: md-merger`

- [ ] **Step 3: Run TypeScript check**

  Run: `tsc --noEmit`
  Expected: No errors

- [ ] **Step 4: Run full test suite**

  Run: `bun test`
  Expected: All 104 tests pass

- [ ] **Step 5: If any test fails, diagnose and fix**

  Check: Test failure output. Likely cause: missed string replacement or wrong expectation value. Fix inline.

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "chore: rebrand tests from evo-ai to md-merger"
```

---

### Task 4: Rebrand Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: All code layers updated from Tasks 1-3
- Produces: Consistent documentation matching new branding

- [ ] **Step 1: Replace all `evo-ai` occurrences in `README.md`**

  Replace (case-aware, preserve casing intent):
  - `# evo-ai` heading → `# md-merger`
  - `Evo-ai` (sentence case) → `Md-merger`
  - `evo-ai` (all other occurrences) → `md-merger`
  - Project structure diagram `evo-ai/` → `md-merger/`
  - Clone URL `evo-ai.git` → `md-merger.git`
  - `cd evo-ai` → `cd md-merger`

  **Note:** Step 1 and Step 3 replacements are mechanically safe and order-independent. `.evo/` dot-prefix does not overlap with `evo-ai/` (one is a dot-prefixed directory, the other a bare path), and `md-merger` contains no `.evo` substring, so there's no risk of cascading or premature replacement.

- [ ] **Step 2: Replace `@evo/*` references in README examples**

  In README.md code examples:
  - `@evo/module-name` → `@md-merger/module-name`
  - `@evo/*` path alias references → `@md-merger/*`

- [ ] **Step 3: Replace `.evo/` and env var references in README**

  In README.md:
  - All `.evo/` → `.md-merger/`
  - All `$EVO_CONFIG` → `$MD_MERGER_CONFIG` (including `$EVO_CONFIG` env var references in prose, lines ~137, ~167)
  - All `EVO_CONFIG` → `MD_MERGER_CONFIG`
  - All `.evo/config.yaml` → `.md-merger/config.yaml`

- [ ] **Step 4: Update CLI command references**

  In README.md:
  - `evo build` → `md-merger build`
  - `evo emit` → `md-merger emit`
  - All other `evo <command>` → `md-merger <command>`

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "chore: rebrand documentation from evo-ai to md-merger"
```

---

### Task 5: Final Verification

**Files:** None (verification only)

**Interfaces:**
- Consumes: All layers updated from Tasks 1-4

- [ ] **Step 1: Grep for any remaining old branding**

  Run: `rg -n "evo-ai|@evo/|EVO_CONFIG|\.evo/" src/ tests/ *.json *.md .gitignore Justfile LICENSE`

  Ignore matches in: `.slim/deepwork/`, `node_modules/`, `dist/`, `Temp/`, `.superpowers/`, `docs/superpowers/` — these are intentionally excluded from the rename scope (plan/spec docs are historical, deepwork files are auto-generated).

  Note: Internal test temp directory names like `evo-test-store-`, `evo-test-emit-`, `evo-test-import-`, `evo-test-resolve-` are intentionally excluded from the grep target scope. These are internal test isolation identifiers that serve no user-facing purpose — they exist solely to ensure test directory cleanup doesn't collide across parallel test runs. Renaming them provides no user-visible value while carrying a real risk of breaking test isolation behavior if not every reference is found and updated simultaneously.

  Expected: Zero matches in production files (excluding the above intentional exclusions).

- [ ] **Step 2: Run TypeScript check**

  Run: `tsc --noEmit`
  Expected: No errors

- [ ] **Step 3: Run full test suite**

  Run: `bun test`
  Expected: All 104 tests pass

- [ ] **Step 4: Create final squash merge-ready state**

  No additional commit needed. The 4 task commits are ready for interactive rebase and squash on merge into main.
