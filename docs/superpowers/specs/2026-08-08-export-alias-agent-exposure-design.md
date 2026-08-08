# Export aliases as OpenCode agent names

## Goal

Use active root-export aliases as the names injected into OpenCode's `agent` map. This changes only the OpenCode-facing agent keys; it does not rename modules or emitted files.

## Scope

- An exported alias whose target is a concrete emitted `type: agent` module is injected under that bare alias.
- An exported module is not additionally injected under its canonical path-derived name.
- A concrete agent with multiple active aliases is injected under every such alias, with the same resolved prompt.
- A concrete agent without an active alias continues to use its canonical path-derived key.
- Active export aliases are the combined root manifests in configured order. A later root replaces an earlier root's value for the same alias, so it controls the one OpenCode agent exposed under that name.
- Existing OpenCode config entries with an injected key continue to be replaced by the generated agent as they are today.

## Non-goals and invariants

- Do not change `extends` normalization or resolution.
- Do not change module identity, store record names, inheritance topology, merge behavior, abstract filtering, output routing, or emitted file paths.
- Do not alter root-export manifest grammar or validation.
- Do not expose aliases for abstract or non-agent modules, because those are not injected as OpenCode agents.

## Design

The CLI build pipeline remains the authority for loading, validating, and merging root exports. It will make the final alias-to-canonical-module map available as build metadata alongside information the plugin already uses to emit agents.

The OpenCode plugin will derive agent injection keys from that metadata:

1. Build roots in the existing defaults-then-project order, collecting the final merged export map with later-root replacement semantics.
2. Emit resolved modules normally using their canonical names and paths.
3. For each emitted concrete agent, find every active export alias whose target equals that agent's canonical module name.
4. If any aliases match, inject its prompt once per matching alias; otherwise inject it with its existing path-derived key.
5. Insert generated entries into OpenCode's `agent` map in the existing way. Map replacement preserves last-root-wins behavior for same alias collisions.

The plugin must not independently parse manifests. Centralizing the export map in the CLI preserves the restricted manifest semantics and keeps inheritance and exposure decisions based on one authoritative merged result.

## Acceptance cases

1. A default concrete agent at `base/core/plan-o-strator.md` exported as `plan-o-strator` is injected only as `plan-o-strator`, not `base/core/plan-o-strator`.
2. If a later project root exports `plan-o-strator` to its own concrete agent, OpenCode receives exactly one `plan-o-strator` entry containing the project prompt.
3. Multiple active aliases targeting one concrete agent each appear as separate OpenCode keys with that agent's prompt.
4. An unexported concrete agent remains exposed at its canonical path-derived key.
5. Existing root-export inheritance tests continue to prove that canonical `extends` resolution and merged prompt content are unchanged.
6. Abstract aliases and non-agent aliases do not create OpenCode agent entries.

## Test strategy

Add focused plugin integration coverage at the CLI/plugin boundary using temporary roots:

- Update the existing root-export test to assert alias exposure while retaining its canonical inheritance assertions.
- Add collision coverage for defaults and a later project root publishing the same alias to distinct concrete agents.
- Add multiple-alias and unexported-agent coverage.
- Run the plugin package test suite and workspace typecheck as the narrow and cross-package checks.

## Delivery constraints

Implementation follows test-driven development: write or update the focused failing plugin integration tests before production changes, implement the minimal metadata/key-selection path, then run the focused suite and typecheck.

The `deepwork` skill is not required because this is a small, isolated CLI/plugin boundary adjustment.
