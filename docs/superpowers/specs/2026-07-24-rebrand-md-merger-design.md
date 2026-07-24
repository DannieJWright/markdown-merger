# Rebrand: evo-ai → md-merger

**Date:** 2026-07-24
**Status:** Approved

## Summary

Rename all branding from `evo-ai` to `md-merger` across the entire codebase. This is a mechanical find-and-replace rebrand with no behavior changes. All 104 existing tests serve as the regression safety net.

## Naming Mapping

| Layer | Current | Becomes |
|-------|---------|---------|
| Package name (`package.json`) | `evo-ai` | `md-merger` |
| CLI binary (`package.json` bin) | `evo` | `md-merger` |
| TypeScript path alias (`tsconfig.json`) | `@evo/*` | `@md-merger/*` |
| Runtime directory (config + gitignore) | `.evo/` | `.md-merger/` |
| Environment variable | `EVO_CONFIG` | `MD_MERGER_CONFIG` |
| Documentation references | `evo-ai` / `Evo-ai` | `md-merger` / `Md-merger` |

## Scope

### Layer 1: Package & Configuration
- `package.json` — name field, bin entry
- `tsconfig.json` — path alias mapping
- `.gitignore` — runtime directory pattern
- `Justfile` — comment references
- `LICENSE` — copyright holder name

### Layer 2: Source Code
- `src/config.ts` — env var name, default config path
- `src/cli.ts` — help text, env var references
- `src/types.ts` — default `rootDirs` value

### Layer 3: Tests & Fixtures
- All 7 test files with `@evo/*` imports → `@md-merger/*`
- `tests/unit/config.test.ts` — env var + path references (~20 occurrences)
- `tests/unit/cli.test.ts` — env var references
- `tests/e2e/e2e.test.ts` — env var references
- `tests/resources/agents-root/config.yaml` — project name field

### Layer 4: Documentation
- `README.md` — heading, descriptions, code examples, project structure diagram

## What is NOT Changed

- Internal module behavior (no logic changes)
- File names or directory structure (beyond string references)
- Test assertions or test structure
- Git history (existing commits preserved)
- Third-party references (Canopy attribution)

## Commit Strategy

Four commits grouped by layer, to be squashed on merge into main:

1. `chore: rebrand package config from evo-ai to md-merger`
2. `chore: rebrand source code from evo-ai to md-merger`
3. `chore: rebrand tests from evo-ai to md-merger`
4. `chore: rebrand documentation from evo-ai to md-merger`

## Verification

After all changes:
- `bun test` — all 104 tests pass
- `tsc --noEmit` — no type errors
- Grep for remaining `evo-ai` / `@evo/` / `EVO_` / `.evo` — zero matches outside git history

## Risks

- **Zero**: No behavior changes. Existing tests cover all functionality. Revert is trivial (git reset).
