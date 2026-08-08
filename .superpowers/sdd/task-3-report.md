# Task 3 Report

## Changes

- Updated `README.md` after the `rootDirs` schema example.
- Documented CWD resolution, optional missing relative roots and stderr warnings, required missing absolute roots and build failure, and combining shared absolute roots with project-local roots through a global `MD_MERGER_CONFIG`.
- No implementation changes were made; the plugin boundary remains unchanged.

## Validation

Commands were run from the worktree root on 2026-08-08:

- `bun test --cwd packages/cli`: **failed** with 168 passing and 1 failing test. The failure is the existing `root-exports` expectation for an empty alias (`Expected substring: "alias"`; received `Expected a mapping entry...`). No new test was added or behavior changed by Task 3.
- `bun test --cwd packages/opencode-plugin`: **failed** with 0 passing and 22 failing tests because the environment cannot resolve `@md-merger/cli/package.json` from the plugin source. This is a known baseline workspace/package-resolution dependency failure, not caused by the README-only change.
- `bun run typecheck`: **failed** because the environment cannot resolve `@opencode-ai/plugin` from `packages/opencode-plugin/src/index.ts`. This is a known baseline plugin dependency failure; no plugin typing adjustment was required.

The requested validation commands therefore produced no new failures attributable to Task 3.
