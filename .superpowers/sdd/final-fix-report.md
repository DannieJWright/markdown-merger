# Final fix report

## Commands and results

- `bun test packages/opencode-plugin/tests/plugin.test.ts` — passed, 18 tests, 0 failures.
- `bun run typecheck` — passed.
- Commit: `f6c61f705a3bfd9e0d6a00a2719c63c056ef81fc`

## Self-review

Exported aliases are collected separately from canonical fallback keys. Fallback injection skips keys claimed by exports, while exported prompts are applied last. This preserves alias-only naming, multiple aliases, inheritance, emission, filtering, and deterministic collision precedence without changing CLI behavior.
