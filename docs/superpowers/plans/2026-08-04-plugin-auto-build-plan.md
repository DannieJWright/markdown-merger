# Plan: Automatic Build-on-Startup for opencode-plugin + Local Defaults Bootstrap

**Date:** 2026-08-04

## Overview

`packages/opencode-plugin`'s `mdMergerPlugin` currently only calls `loadConfig()` and `emitAll()` on OpenCode startup. It never runs the CLI's `build()` step, so any user-authored agent Markdown source is never scanned/imported into the prompt store, and the plugin silently falls back to bundled defaults (which are also absent from a raw local checkout, since they're only populated by `packages/opencode-plugin`'s `prepublishOnly` script). This was root-caused via investigation in the current conversation (see prior session context — no separate spec doc; the fix scope below is what the user explicitly approved).

This plan makes the plugin call `build()` automatically on every OpenCode session start (before `emitAll()`), so users never have to manually run `md-merger build`. It also adds a `just build-local` recipe to populate `packages/opencode-plugin/defaults/` for local dev/testing (a copy-only operation, deliberately avoiding the `prepublishOnly` script's `package.json` mutation side effect), and gitignores that generated directory.

## Required Skills

> The agent executing this plan **MUST** invoke the `subagent-driven-development` skill for implementation execution.
>
> For large, high-risk, or multi-phase efforts, the agent **MUST** also invoke the `deepwork` skill.
>
> Do **NOT** read the content of these skills — just invoke them and follow their defined workflow. The skill descriptions in the system prompt tell you when each applies.

> **⚠️ BEFORE IMPLEMENTATION:** You must invoke the `subagent-driven-development` skill for this plan. This plan is a small, bounded, single-package-pair change (opencode-plugin + cli export surface + Justfile/.gitignore) — `deepwork` is not required unless the implementing agent discovers unexpected cross-package coupling; if so, invoke `deepwork` at that point and note why. Do not skip `subagent-driven-development`.

> **TDD requirement:** For every change below with an observable effect (plugin auto-build behavior, CLI export, Justfile recipe, gitignore), write or run the failing check **first** to confirm the current (pre-fix) behavior, then make the change, then re-run the same check to confirm it now passes. Do not mark any step complete without this red→green evidence.

## Context

### Codebase state

- **`packages/cli/src/api.ts`** — public library API surface consumed by the plugin. Current full content:
  ```ts
  // src/api.ts — public library API surface for @md-merger/opencode-plugin

  export { loadConfig, getConfigPath } from "./config";
  export { emitAll } from "./emit";
  export type { Config } from "./types";
  export { DEFAULT_CONFIG, DEFAULT_MAX_INHERIT_DEPTH } from "./types";
  export { parseCliArgs, run, type CliArgs } from "./cli";
  ```
  `build` is **not** exported from this file. It must be added.

- **`packages/cli/src/import.ts`** — defines `build()`:
  ```ts
  export async function build(
    rootDirs: string[],
    storePath: string,
    project: string,
  ): Promise<void> {
  ```
  Body at lines 31-89 (per current file): recursively imports Markdown files from each root dir, derives module paths, parses frontmatter/sections, preserves first-root precedence, writes/updates records in the JSONL store at `storePath`. No return value (void) — success/failure is via throw.

- **`packages/cli/src/cli.ts`** — existing CLI call site for reference (do not change):
  ```ts
  case "build": {
    await build(config.rootDirs, storePath, config.project);
    console.log(`Built ${config.rootDirs.length} root dir(s) into ${storePath}`);
    break;
  }
  ```
  Note: `storePath` here is the resolved absolute/relative path derived from `config.storeFile` (see `packages/cli/src/config.ts` path resolution — resolve `config.storeFile` the same way `cli.ts` does before calling `build`, do not assume `config.storeFile` is directly usable as `storePath` without checking how `cli.ts` computes it).

- **`packages/opencode-plugin/src/index.ts`** — full current content:
  ```ts
  import type { Plugin, PluginInput } from "@opencode-ai/plugin";
  import { loadConfig, emitAll } from "@md-merger/cli";
  import type { Config } from "@md-merger/cli";
  import { existsSync } from "node:fs";
  import { readdir, readFile } from "node:fs/promises";
  import { join, dirname } from "node:path";
  import { fileURLToPath } from "node:url";

  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Defaults are bundled in the plugin package via prepublishOnly (copies ../cli/defaults/ to ./defaults/)
  const defaultsDir = join(__dirname, "..", "defaults", "agents");

  async function loadBundledDefaults(): Promise<Map<string, string>> {
    const defaults = new Map<string, string>();
    if (!existsSync(defaultsDir)) return defaults;
    const entries = await readdir(defaultsDir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const agentName = entry.slice(0, -3);
      try {
        const content = await readFile(join(defaultsDir, entry), "utf-8");
        defaults.set(agentName, content);
      } catch {
        console.warn(`[md-merger] Failed to read bundled default: ${entry}`);
      }
    }
    return defaults;
  }

  export const mdMergerPlugin: Plugin = async (_input: PluginInput) => {
    try {
      const bundledDefaults = await loadBundledDefaults();
      if (_input.directory) process.chdir(_input.directory);
      const config = await loadConfig();
      const writtenPaths = await emitAll(config.storeFile, config.emitDirs, config, false);

      if (writtenPaths.length === 0 && bundledDefaults.size > 0) {
        console.log("[md-merger] No config found — bundled defaults available from defaults/agents/");
      }

      const agentHooks = {
        config: async (opencodeConfig: Record<string, unknown>) => {
          if (writtenPaths.length > 0) {
            if (opencodeConfig.agent === undefined) {
              opencodeConfig.agent = {};
            }
            const agentConfig = opencodeConfig.agent as Record<string, unknown>;
            for (const path of writtenPaths) {
              try {
                const content = await readFile(path, "utf-8");
                const agentName = path.replace(/\.md$/, "").replace(/.*[/\\]/, "");
                agentConfig[agentName] = { prompt: content };
              } catch {
                console.warn(`[md-merger] Failed to read emitted agent: ${path}`);
              }
            }
          } else {
            console.log("[md-merger] No emitted agents found, using bundled defaults");
            if (opencodeConfig.agent === undefined) {
              opencodeConfig.agent = {};
            }
            const agentConfig = opencodeConfig.agent as Record<string, unknown>;
            for (const [name, content] of bundledDefaults) {
              agentConfig[name] = { prompt: content };
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

- **`packages/opencode-plugin/tests/plugin.test.ts`** — full current content (only tests export shape, not build/emit behavior):
  ```ts
  import { describe, expect, it } from "bun:test";

  describe("plugin initialization", () => {
    it("plugin exports mdMergerPlugin as an async function", async () => {
      const plugin = await import("../src/index");
      expect(plugin.mdMergerPlugin).toBeDefined();
      expect(typeof plugin.mdMergerPlugin).toBe("function");
    });

    it("plugin returns hooks object on success", async () => {
      const plugin = await import("../src/index");
      const hooks = await plugin.mdMergerPlugin({} as any);
      expect(hooks).toBeDefined();
      expect(typeof hooks).toBe("object");
    });
  });
  ```
  This test file will need new test cases added (not existing ones broken) for the auto-build behavior.

- **`packages/cli/tests/unit/import.test.ts`** — existing direct tests of `build()`; use as a reference pattern for fixture setup (temp rootDirs, temp store path) when writing new plugin-level tests, but do not modify this file — it's out of scope.

- **`packages/opencode-plugin/package.json`** — contains `prepublishOnly`:
  ```json
  "prepublishOnly": "node -e \"const p=require('./package.json'); p.dependencies['@md-merger/cli']='^' + p.version; require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2)+'\\n'); const {cpSync, existsSync} = require('fs'); if (existsSync('../cli/defaults')) cpSync('../cli/defaults', './defaults', {recursive:true}); else console.warn('defaults/ not found - skip copy')\""
  ```
  This mutates `package.json`'s `@md-merger/cli` dependency field as a side effect — it must NOT be reused for local dev bootstrap. A new, narrower mechanism (Justfile recipe) is required instead (see below).

- **Root `Justfile`** — was recently restored (see prior remediation plan `docs/superpowers/plans/2026-08-04-deployment-pipeline-remediation-plan.md`) to point at `./packages/cli/src/index.ts` for `build`, `emit`, `render`, `doctor`, `stats` recipes. Read the current Justfile before editing to match its existing recipe style/formatting exactly (recipe naming convention, comment style, shebang/shell settings if any).

- **Root `.gitignore`** — was recently restored to include `.md-merger/` and `packages/*/tests/build/` entries (per the same prior remediation plan). Read current content before editing; add the new entry without disturbing existing entries/ordering conventions.

### Files to modify

1. **`packages/cli/src/api.ts`** — add `export { build } from "./import";` (exact export name/path to confirm against `import.ts`'s actual export — it is a named export `build`, from `./import`, i.e. `packages/cli/src/import.ts`). Keep existing exports unchanged; add this as a new line in the existing grouped-export style.

2. **`packages/opencode-plugin/src/index.ts`** — import `build` from `@md-merger/cli` alongside the existing `loadConfig, emitAll` import. Call `build(config.rootDirs, <resolved storePath>, config.project)` after `loadConfig()` and before `emitAll()`, every plugin init (i.e., every OpenCode session start — no caching/staleness check, per explicit user decision). Wrap in the existing try/catch (a `build()` failure should not crash the whole plugin — decide whether to let it propagate to the existing outer catch, which currently logs and returns `{}`, or add a narrower catch that logs and continues to `emitAll()` with whatever store state exists; default to letting it propagate to the outer catch unless the implementing agent finds a reason `emitAll()` should still attempt to run even if `build()` throws — if so, flag this as a decision point in the task report, don't silently choose).
   - Determine the correct `storePath` value to pass to `build()`: check how `packages/cli/src/cli.ts`'s `build` case computes its `storePath` local variable from `config.storeFile` (path resolution, likely relative-to-cwd join) and replicate the same resolution in the plugin — do not assume `config.storeFile` is already an absolute/resolved path.

3. **`packages/opencode-plugin/tests/plugin.test.ts`** — add new test case(s) (do not remove/alter the two existing tests) proving the plugin now builds automatically: e.g. a test with a temp directory containing a config + agent source Markdown (no pre-existing store file), that runs `mdMergerPlugin({ directory: tempDir } as any)`, then asserts the store file now exists / contains records, and/or that the returned `config` hook, when invoked, injects the expected agent. Follow the existing test file's style (bun:test, temp fixture pattern borrowed from `packages/cli/tests/unit/import.test.ts`).

4. **Root `Justfile`** — add a new recipe `build-local` that copies `packages/cli/defaults/` to `packages/opencode-plugin/defaults/` (recursive copy, create destination if missing), matching the existing recipe comment/naming style. This must be a **plain copy only** — it must NOT touch `packages/opencode-plugin/package.json` (no dependency version rewrite), unlike `prepublishOnly`. Use a cross-platform-safe approach consistent with how other recipes in this Justfile invoke `bun`/shell commands (check existing recipes for whether they assume PowerShell, POSIX sh, or use `just`'s built-in `cp` support — match that convention; if unsure, prefer a small inline `bun -e` or Node one-liner using `fs.cpSync`, consistent with how `prepublishOnly` itself does the copy, to avoid cross-shell portability issues on Windows vs POSIX CI runners).

5. **Root `.gitignore`** — add `packages/opencode-plugin/defaults/` as a new ignored entry, placed near the existing `packages/*/node_modules/` / `packages/*/tests/build/` workspace-generated-content entries for consistency, per current file conventions.

### Dependencies / constraints

- Do not modify `packages/opencode-plugin/package.json`'s `prepublishOnly` script — it remains the publish-time mechanism; `just build-local` is a separate, additive, local-dev-only mechanism.
- Do not change the npm publish workflows (`.github/workflows/md-merger-publish.yml`, `.github/workflows/opencode-plugin-publish.yml`) — out of scope for this plan.
- The plugin must call `build()` unconditionally on every init per explicit user decision ("run it every session start") — do not add a staleness/mtime check or skip-if-unchanged optimization unless the user asks for it later.
- `packages/opencode-plugin/defaults/` must remain gitignored and generated-only (via `just build-local` or `prepublishOnly`), never committed.

### Environment

- No new environment variables or secrets required.
- Requires Bun (already a project prerequisite) for any test/build commands.

## Implementation Steps

1. **TDD baseline (red) for CLI export:** Confirm `build` is not currently importable from `@md-merger/cli`'s public API (`packages/cli/src/api.ts`) — write/run a quick failing check (e.g. a throwaway import in a scratch test, or grep-based static confirmation) before adding the export.
2. Add `export { build } from "./import";` to `packages/cli/src/api.ts`.
3. **TDD checkpoint (green):** Confirm `build` is now importable from `@md-merger/cli` (re-run the check from step 1, now passing). Run `packages/cli`'s existing test suite to confirm no regressions from the export addition.
4. **TDD baseline (red) for plugin auto-build:** Add the new test case(s) to `packages/opencode-plugin/tests/plugin.test.ts` per Context item 3 above, proving that with a fresh temp store (no prior `build()` run), the plugin currently does NOT populate agents from source Markdown (i.e., write and run this test against the *current* plugin code first, confirm it fails/red, demonstrating the gap).
5. Modify `packages/opencode-plugin/src/index.ts` to import and call `build()` automatically before `emitAll()`, per Context item 2 above (including correct `storePath` resolution matching `cli.ts`'s convention, and the try/catch decision noted above).
6. **TDD checkpoint (green):** Re-run the new plugin test case(s) from step 4 — confirm they now pass. Also re-run the two pre-existing tests in `plugin.test.ts` to confirm no regressions.
7. Run full `packages/opencode-plugin` and `packages/cli` test suites plus root `bun test` / `bun run typecheck` to confirm no repo-wide regressions.
8. **TDD baseline (red) for Justfile recipe:** Confirm `packages/opencode-plugin/defaults/` does not exist and no `build-local` Justfile recipe exists yet (`just --list` should not show it; directory listing should confirm absence).
9. Add the `build-local` recipe to the root `Justfile` per Context item 4 above.
10. Add `packages/opencode-plugin/defaults/` to root `.gitignore` per Context item 5 above.
11. **TDD checkpoint (green):** Run `just build-local`, confirm `packages/opencode-plugin/defaults/` now exists and contains the same files as `packages/cli/defaults/` (diff or listing comparison). Confirm `git status` shows the new directory as ignored (not untracked), and confirm `packages/opencode-plugin/package.json` was NOT modified by this recipe (diff against its pre-recipe state).
12. Produce a short final report covering: (a) the CLI export addition and its test evidence, (b) the plugin auto-build change and its test evidence (red→green), (c) confirmation the `build()` failure-handling decision point was resolved and how, (d) the Justfile recipe and gitignore addition with verification evidence, (e) full test suite pass confirmation, (f) explicit note that this plan does not address publish-workflow changes or the `prepublishOnly` script — those remain unchanged.

## Verification

- `bun test` inside `packages/cli` → all pass, including new export usable and no regressions.
- `bun test` inside `packages/opencode-plugin` → all pass, including new auto-build test case(s) demonstrating red→green, and the two pre-existing tests still passing.
- `bun test` at repo root → all pass, no regressions (compare against the 111/111 baseline noted in the prior remediation plan, adjusted for newly added tests).
- `bun run typecheck` at repo root → exits 0.
- `just --list` shows `build-local`; running `just build-local` creates `packages/opencode-plugin/defaults/` populated identically to `packages/cli/defaults/`, does not modify `packages/opencode-plugin/package.json`, and the directory is confirmed gitignored via `git status`/`git check-ignore`.
- Manual/structural review confirms `packages/opencode-plugin/src/index.ts` now calls `build()` unconditionally before `emitAll()` on every plugin init, with no staleness-check shortcut.
</content>
