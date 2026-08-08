# Final fix report

Implemented the string-root public configuration contract and internal resolved roots.

## Validation

- `bun test --cwd packages/cli tests/unit/config.test.ts tests/unit/import.test.ts tests/e2e/e2e.test.ts` — 33 passed, 0 failed.
- `bun run typecheck` — blocked only by the existing missing `@opencode-ai/plugin` type/module dependency.

## Commits

- `d6f8205 fix: preserve string root config contract`
- `cf61422 fix: narrow resolved config roots`

## Notes

Relative roots remain optional and are skipped with a warning; absolute roots remain required. Build accepts the resolved configuration while retaining string and `RootDir` compatibility for direct callers. Existing dependency baseline blocker remains unresolved.

## Final verification

- `bun test --cwd packages/cli tests/unit/config.test.ts tests/unit/import.test.ts` — 33 passed, 0 failed.
- `bun test --cwd packages/opencode-plugin tests/plugin.test.ts` — 0 passed, 22 failed during module loading because `@md-merger/cli/package.json` is unavailable in the workspace dependency setup.
- Commit: `ca447fe fix: restore plugin defaults precedence`.

The plugin now passes required bundled defaults first, followed by resolved project roots. The regression test exercises `loadConfig()` output directly through `build()` and verifies the missing-root warning plus later-root precedence.
