# Plan: Restore Monorepo Workspace State & Fix npm/GitHub Actions Deployment Pipeline

**Date:** 2026-08-04

## Overview

Commit `4b57ba3` ("feat: restructure project as evo-ai monorepo") — made by a *different* session (`ses_0519d9d4cffeVO9A72oEEKm0Bn` → `ses_0341fa7f3ffen2XSPnVFa7SPNG`) than the one that actually implemented the monorepo restructure (`ses_0522e7c21ffeNXZ93awdTG5718`) — silently reverted the root workspace configuration (`package.json`, `tsconfig.json`, `Justfile`, `.gitignore`) back to a pre-restructure, single-package shape. This broke Bun workspace resolution for `packages/opencode-plugin`'s `"@md-merger/cli": "workspace:*"` dependency. Confirmed via non-mutating `bun install --dry-run`: **5 packages removed**.

This plan restores the workspace to a valid state, removes stale duplicate root source/test directories, and hardens the two GitHub Actions publish workflows (`.github/workflows/md-merger-publish.yml`, `.github/workflows/opencode-plugin-publish.yml`) so the monorepo can reliably deploy `@md-merger/cli` and `@md-merger/opencode-plugin` to npm via npm OIDC Trusted Publishing (this part is **intentionally kept** — do not replace with token-based auth).

`packages/opencode-plugin`'s real-world compatibility with a live OpenCode runtime cannot be fully verified until the packages are actually published (or locally linked) and loaded into an OpenCode instance — this plan includes a best-effort static/structural verification step now, and flags the live-runtime check as a follow-up that depends on a successful npm publish.

## Required Skills

> The agent executing this plan **MUST** invoke the `subagent-driven-development` skill for implementation execution.
>
> For large, high-risk, or multi-phase efforts, the agent **MUST** also invoke the `deepwork` skill.
>
> Do **NOT** read the content of these skills — just invoke them and follow their defined workflow. The skill descriptions in the system prompt tell you when each applies.

> **⚠️ BEFORE IMPLEMENTATION:** You must invoke the `subagent-driven-development` skill (and `deepwork`, since this is a multi-phase repo-structure + CI remediation effort touching multiple packages). This is not optional. Do not skip this step.

> **TDD requirement:** For every code/config change below that has an observable, testable effect (workspace install resolution, package builds, plugin import/tests, workflow YAML validity), write or run the failing check **first** to confirm the current broken state, then make the change, then re-run the same check to confirm it now passes. Do not mark any step complete without this red→green evidence. Steps that are pure file restoration (e.g. deleting stale directories) still require an install/build/test check afterward as the "green" proof.

## Context

### Codebase state (as of HEAD `4b57ba3`, evo-ai repo at `C:/Users/Danni/Documents/Git/evo-ai`)

- Root `package.json` is currently a **standalone publishable-looking** `evo-ai` package (`bin: {"evo": "./src/index.ts"}`, no `private`, no `workspaces`) — this is wrong; it must be a **private workspace container**.
- Root `tsconfig.json` currently points at `rootDir: "src"`, `include: ["src/**/*.ts"]` — wrong; must point at `packages/*`.
- Root `Justfile` currently invokes `bun ./src/index.ts ...` — wrong; must invoke `bun ./packages/cli/src/index.ts ...` (or delegate into `packages/cli`'s own scripts).
- Root `.gitignore` currently ignores `.evo/`, `tests/build/` only — missing `packages/*/node_modules/`, `packages/*/tests/build/`, `.opencode/`.
- **Stale duplicate directories still exist at repo root**: `src/`, `tests/`, and an untracked `opencode-plugin/` directory — these are leftovers from before the restructure and must be removed once `packages/cli/src` and `packages/cli/tests` are confirmed to contain the real, current code.
- `packages/cli/` and `packages/opencode-plugin/` already exist and are believed structurally correct (confirmed by prior audit — see below) but currently cannot resolve their workspace link because the root isn't a workspace.
- `packages/opencode-plugin/package.json` depends on `"@md-merger/cli": "workspace:*"` and has a `prepublishOnly` script that copies `../cli/defaults` → `./defaults`.
- **Naming ambiguity to resolve first:** the reverted commit introduced "evo"/`evo-ai` branding (`.evo/` config dir, `bin: {"evo": ...}`) that does not appear in the original restructure plan or in commit `fb93c4a` (which used `.md-merger/` and `@md-merger/monorepo`). It is unclear whether the "evo" rename was an intentional separate change bundled into the same commit, or accidental copy-paste from a stale branch.
  - Git history (`git log --oneline --all | grep -i evo`) shows `evo-ai`/`@evo/*` was the ORIGINAL name, deliberately abandoned in favor of `md-merger`/`@md-merger/*` via commits `7f2750f`, `e3c93d9`, `c33249a`, `c1bc814`, `4d7731b`, and `f461b56` (all dated 2026-07-23/24, rebranding evo-ai → md-merger). Commit `4b57ba3` (confirmed single-parent, non-merge) re-added `evo-ai`-branded files matching the pre-rebrand snapshot — strong evidence this was accidental reintroduction of stale/deprecated branding, not an intentional new decision. Default to md-merger, but explicitly ask the user to confirm before finalizing.

### Files to modify

1. **`package.json`** (root) — make it a private workspace container:
   ```json
   {
     "name": "evo-ai",
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
   (Use `"evo-ai"` as the name per the naming-ambiguity resolution above unless the user says to revert to `@md-merger/monorepo`. Keep `devDependencies` versions as currently pinned in `packages/cli`/`packages/opencode-plugin` if they differ — reconcile, don't blindly overwrite.)

2. **`tsconfig.json`** (root) — restore workspace-aware resolution:
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
   Verify against each package's own `tsconfig.json` if one exists per-package (check `packages/cli/tsconfig.json`, `packages/opencode-plugin/tsconfig.json` before assuming root-only config is sufficient).

3. **`Justfile`** (root) — point commands at `packages/cli/src/index.ts` instead of root `src/index.ts`. Preserve current recipe names/comments; only change the `bun ./src/index.ts` → `bun ./packages/cli/src/index.ts` paths (5 occurrences: `build`, `emit`, `render`, `doctor`, `stats`).

4. **`.gitignore`** (root) — merge current entries with restored workspace entries:
   ```gitignore
   # Local RAG
   models/

   # AI state
   .slim/deepwork/
   .superpowers/
   .opencode/

   # Project files
   node_modules/
   packages/*/node_modules/
   dist/

   # Generated files
   .evo/            # or .md-merger/ per naming decision above

   # Worktrees
   .worktrees/

   # Test output
   packages/*/tests/build/
   ```

5. **Remove stale root directories** — root `src/` and `tests/` are a divergent, mostly-passing ALTERNATE CLI implementation, not simple duplicates: root `src/config.ts` uses `EVO_CONFIG`/`.evo/config.yaml`, while `packages/cli/src/config.ts` uses `MD_MERGER_CONFIG`/`.md-merger/config.yaml`; root `src/index.ts` is a monolithic 134-line switch-based `main()`, while the package delegates to extracted `run()` in `cli.ts` and separate `api.ts`. `bun test src` yields 88 pass and 1 fail across 89 tests in 6 files, and root `tests/` lacks the package's `unit/`/`e2e/` split. `packages/cli/src` (md-merger branding) is the actively-integrated, CI-published implementation and is authoritative; root `src/` is divergent and orphaned, and its unique architecture/branding choices are intentionally discarded, not merely cleaned up. Require explicit human sign-off on this claim before deletion in Step 8. The untracked root `opencode-plugin/` (only gitignored `node_modules/.bin/md-merger.bunx` and `.exe`) remains safe to delete without this caveat.

6. **`.github/workflows/opencode-plugin-publish.yml`** — fix the trigger reliability and add a success guard:
   - Current:
     ```yaml
     on:
       workflow_run:
         workflows: ["Publish @md-merger/cli to npm"]
         types: [completed]
         branches: [main]
       workflow_dispatch:
     ```
     with no `if:` guard on the job.
   - `workflow_run.branches` filters against the branch of the *triggering* workflow run, but `md-merger-publish.yml` triggers off `push: tags: 'v*'`, not a branch push — this combination is documented as unreliable (see references below), so the chain likely never auto-fires today.
   - **Fix:** remove the `branches:` filter (tags don't have a meaningful "branch" for this purpose) and add a job-level guard:
     ```yaml
     on:
       workflow_run:
         workflows: ["Publish @md-merger/cli to npm"]
         types: [completed]
       workflow_dispatch:

     jobs:
       publish-plugin:
         if: ${{ github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success' }}
         runs-on: ubuntu-latest
         ...
     ```
   - Keep `permissions: id-token: write` and `npm publish --provenance --access public` — **npm OIDC Trusted Publishing is an intentional, approved design choice; do not replace it with `NPM_TOKEN`/`NODE_AUTH_TOKEN`.**

7. **Both publish workflows** — add a validation gate before `npm publish` (currently missing entirely, meaning CI would silently ship a broken workspace without ever running `bun test`/`tsc --noEmit`). Insert after `bun install` and before the publish/bundle steps:
   ```yaml
   - run: bun run typecheck
   - run: bun test
   ```
   Run these at the workspace root (per the existing "Runs at workspace root for workspace resolution" comment convention) so they exercise the real workspace-linked packages, not a package in isolation.

### Dependencies / constraints

### Follow-up / Out of Scope

- There is no PR/push-triggered CI workflow; test/typecheck gating exists only inside release/publish workflows, so regressions are caught at tag-push time rather than on every commit.
- Root `bun test`/`tsc --noEmit` scan the whole workspace, so an unrelated `packages/opencode-plugin` bug could block a `packages/cli`-only release via `md-merger-publish.yml`, and vice versa. This coupling is accepted for now but should be revisited.

- npm OIDC/Trusted Publishing (`id-token: write` + `npm publish --provenance`) is **intentional and must be preserved**. Actual npm-side "Trusted Publisher" configuration (repo + workflow filename + runner match) lives outside this repo on npmjs.com and cannot be verified from source — note this as an external dependency in the final report, don't attempt to configure it from the repo.
- `packages/opencode-plugin` depends on `packages/cli` via `workspace:*` — the workspace fix in this plan is a hard prerequisite for the plugin package to build/test/publish correctly.
- Live OpenCode-runtime compatibility testing for `packages/opencode-plugin` is **out of scope for this plan** until packages are actually published (or npm-linked locally). Add a follow-up task/plan item (not executed here) to load the published/linked plugin into a real OpenCode instance and confirm the `config` hook actually loads once `@md-merger/cli` v1.0.0+ is on npm.

### Environment

- Requires Bun (`oven-sh/setup-bun`) and Node 24 (`actions/setup-node`) in CI, matching current workflow setup — no changes needed there.
- No new environment variables/secrets required; OIDC auth needs no repo secrets.

## Implementation Steps

1. **Resolve naming ambiguity** (md-merger vs evo-ai branding) — check git history for other intentional "evo" commits; if ambiguous, ask the user directly before writing final root config file content. Do not proceed past this step with an assumption.
2. **TDD baseline (red):** Run `bun install --dry-run` and record the "N packages removed" output as the failing baseline. Run `bun test` / `tsc --noEmit` at root and in `packages/opencode-plugin` and record current failures/errors caused by the missing workspace link.
3. Restore root `package.json` as a private workspace container (per Context §1 above, with resolved naming).
4. Restore root `tsconfig.json` for workspace-aware path resolution (per Context §2), reconciling with any per-package tsconfig files found.
5. Restore root `Justfile` command paths (per Context §3).
6. Merge root `.gitignore` (per Context §4, with resolved naming for the config-dir ignore entry).
7. **TDD checkpoint (green, partial):** Run `bun install --dry-run` again — confirm 0 packages removed / workspace links resolve. This is the primary regression-fix proof.
8. Obtain explicit human sign-off that `packages/cli/src` is authoritative and root `src/` is a divergent orphan whose unique architecture/branding is intentionally discarded; then delete root `src/`, `tests/`, and `opencode-plugin/`.
9. **TDD checkpoint (green):** Run `bun test` and `tsc --noEmit` at root, and `bun test` inside `packages/cli` and `packages/opencode-plugin` — confirm all pass (previously-passing count from prior verification was 111/111 for the full suite; use that as the target, adjust if legitimate new tests exist).
10. Fix `.github/workflows/opencode-plugin-publish.yml` trigger + success guard (per Context §6).
11. Add `bun run typecheck` + `bun test` gates to both publish workflows before their `npm publish` steps (per Context §7).
12. **CI YAML validation:** Use `actionlint` or GitHub's workflow syntax check (or a dry structural review) on both modified workflow files to confirm no YAML/schema errors were introduced.
13. Produce a short final report covering: (a) confirmation of workspace fix with dry-run evidence, (b) confirmation of test/typecheck pass, (c) the two workflow fixes applied, (d) explicit note that npm Trusted Publisher npm-side configuration is an external, unverified dependency, (e) explicit note that live OpenCode-runtime plugin compatibility remains untested pending an actual publish/link, with a recommended follow-up plan for that specific verification.

## Verification

- `bun install --dry-run` → `0 packages removed` (or only intentionally-removed dev tooling, none of the workspace-linked packages: `@md-merger/cli`, `@md-merger/opencode-plugin`, `@opencode-ai/plugin`).
- `bun run typecheck` (root) → exits 0.
- `bun test` (root, and inside `packages/cli`, `packages/opencode-plugin`) → all pass, no regressions vs. the previously-confirmed 111/111 baseline.
- `git status` / directory listing → no stale root `src/`, `tests/`, `opencode-plugin/` directories remain; only `packages/cli/`, `packages/opencode-plugin/` contain source.
- Manual/structural review (or `actionlint` if available) of both `.github/workflows/*.yml` → valid YAML, `workflow_run` no longer filtered by `branches:`, job has an explicit `if:` success/dispatch guard, both workflows run `typecheck`/`test` before `npm publish`.
- **GitHub `workflow_run` callout:** the workflow uses the file on default branch `main`, regardless of the upstream ref; confirm the fix is merged to `main` before expecting it to take effect.
- Explicit written confirmation in the final report that npm OIDC/Trusted Publishing config remains an unverifiable external dependency, and that live OpenCode plugin-runtime compatibility is a follow-up item, not something this plan claims to have fully closed.
