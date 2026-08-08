# Final Export Target Ownership Design

## Goal

Make OpenCode alias ownership follow only the final root-export map. A later project export can replace a bundled alias target without descendant modules competing for that alias.

## Rules

- Each final `exports` entry maps one alias to one canonical module path.
- An emitted concrete agent receives an alias only when its canonical path is that entry's final target.
- A later root replaces an earlier root's target for the same alias.
- A module that merely extends an exported target never inherits that target's alias.
- `exportedModules` continues to suppress canonical OpenCode keys for every root-manifest target, including superseded targets.
- An unexported, unrelated concrete agent retains its canonical key.

## Behavior Examples

### 1. Same-path override

Bundled defaults export `plan-o-strator` to:

```text
defaults/agents/base/core/plan-o-strator.md
```

The project supplies a module at the same relative path:

```text
.md-merger/input/agents/base/core/plan-o-strator.md
```

Later-root same-path replacement makes the project module the final canonical target at `base/core/plan-o-strator`. OpenCode injects:

```text
plan-o-strator -> the project's replacement content
```

It does not inject `base/core/plan-o-strator` as a canonical agent key.

### 2. New child at a different path, without a project export

Bundled defaults retain:

```text
defaults/agents/base/core/plan-o-strator.md
```

The project supplies:

```text
.md-merger/input/agents/base/plan-o-strator.md
```

with:

```yaml
extends:
  - plan-o-strator
```

This is a distinct module, not an override. The bare reference resolves to the bundled canonical target for inheritance. Because the project does not replace the export, OpenCode injects:

```text
plan-o-strator      -> bundled default content
base/plan-o-strator -> project child merged with the default
```

The child does not inherit the alias merely because it extends the aliased bundled module.

### 3. New child at a different path, with a project export

Bundled defaults export:

```yaml
exports:
  plan-o-strator: base/core/plan-o-strator
```

The project adds `base/plan-o-strator.md`, extends `base/core/plan-o-strator`, and exports:

```yaml
exports:
  plan-o-strator: base/plan-o-strator
```

OpenCode injects only `plan-o-strator`, with the project's merged prompt. It does not inject `base/plan-o-strator` or `base/core/plan-o-strator`. The bundled target remains available only to resolve inheritance.

## Implementation Boundary

The OpenCode plugin already receives `BuildResult.exports`, which represents final later-root-wins ownership, and `BuildResult.exportedModules`, which records all manifest targets. It must build alias lookup exclusively from `exports`; it must remove descendant alias inference and any direct JSONL-store parsing added for that inference.

Canonical fallback filtering remains based on `exportedModules` so current and superseded export targets stay hidden, while unrelated agents remain available.

## Acceptance Cases

1. A bundled explicitly exported target injects only its alias.
2. A project export of the same alias to a child module replaces the bundled target and injects only the project child under the alias.
3. Multiple children extending the same exported base do not receive the base's alias unless explicitly exported.
4. An unrelated concrete agent remains available under its canonical path.
5. A final target with multiple aliases injects under each final alias and not its canonical path.

## Verification

- Add focused plugin integration tests first and observe them fail against descendant alias propagation.
- Run `bun test --cwd packages/opencode-plugin tests/plugin.test.ts` after implementation.
- Run `bun test`, `bun run typecheck`, and `git diff --check` before completion.
