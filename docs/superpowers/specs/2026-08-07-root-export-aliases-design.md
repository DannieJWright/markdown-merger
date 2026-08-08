# Root Export Aliases Design

## Summary

Md-merger will support explicit, overrideable bare-name references in Markdown `extends` frontmatter. Each configured input root may publish aliases through an optional `md-merger-root.yaml`. A later root may replace an earlier root's alias, allowing project modules to inject implementations into a bundled inheritance hierarchy without replacing modules that have the same full path.

Exact slash-qualified references remain stable and continue to identify one module path. All references are converted to canonical, extensionless module paths during `build`, so the store and downstream inheritance graph remain path-based.

## Goals

- Allow a Markdown module to extend a bare exported name such as `base-orchestrator`.
- Let later configured roots override an earlier root's export of the same bare name.
- Preserve exact imports such as `base/base-orchestrator`.
- Accept an optional trailing `.md` in exact references and export targets.
- Preserve existing bare imports of root-level modules when no alias is exported.
- Validate root export configuration before changing the append-only store.
- Keep resolution, cycle detection, topology, emission, and doctor checks operating on canonical module paths.

## Non-goals

- Inferring aliases from filenames.
- Supporting filesystem-relative syntax such as `./base` or `../base`.
- Allowing one root's export declaration to target a module in another root.
- Adding configurable root-manifest filenames.
- Changing section or frontmatter merge precedence.
- Changing the existing same-full-path rule in which a later root replaces an earlier root's module record.

## Terminology

- **Module path:** Extensionless path relative to a configured root, normalized with `/`, such as `base/base-orchestrator`.
- **Exact reference:** An `extends` value containing `/`, such as `base/base-orchestrator`.
- **Bare reference:** An `extends` value containing no `/`, such as `base-orchestrator`.
- **Root export:** A bare name mapped by `md-merger-root.yaml` to a module in that same root.
- **Canonical reference:** The extensionless module path stored in `PromptRecord.extends`.

## Root Export Manifest

Each configured `rootDir` may contain a file named exactly `md-merger-root.yaml` at its top level:

```yaml
exports:
  orchestrator: base/orchestrator.md
  base-orchestrator: base/base-orchestrator
```

The file is optional. A root without it still contributes Markdown modules and exact module paths, but contributes no aliases.

The manifest uses a deliberately restricted YAML subset consistent with the project's dependency-free configuration approach:

- blank lines and full-line comments are allowed;
- CRLF and LF line endings are accepted;
- exactly one unindented `exports:` key is allowed;
- export entries are indented by exactly two spaces and use unquoted, non-empty scalar aliases and targets;
- an empty `exports:` mapping is valid;
- quoted scalars, inline comments, inline mappings, nested values, and additional top-level keys are rejected rather than interpreted partially.

### Validation

Before appending any records, `build` validates every manifest:

- The document must contain one top-level `exports` mapping.
- Repeated top-level `exports` declarations are invalid.
- Every export key must be a non-empty bare name and must not contain `/` or `\`.
- Duplicate export keys within one manifest are invalid, even if YAML's usual map semantics would otherwise keep one value.
- Every export value must be a non-empty string path relative to that root.
- A target must not be absolute under either POSIX or Windows semantics, contain `.` or `..` path segments, or escape the root.
- Backslashes are normalized to `/`, and one trailing `.md` is removed.
- The canonical target must name a Markdown module that exists in the same root.
- The manifest itself is configuration and is never imported as a Markdown module.

Malformed syntax, malformed `exports`, duplicate aliases, invalid paths, and missing targets abort the complete build before the JSONL store is written. Errors identify the manifest and offending alias or target where applicable.

## Reference Resolution

Before importing module records, `build` scans every root and validates every root manifest. It combines root exports in the configured `rootDirs` order. When multiple roots export the same alias, the later root's target replaces the earlier target.

Each `extends` entry is trimmed, has path separators normalized to `/`, and has one trailing `.md` removed. It then resolves as follows:

1. If the normalized reference contains `/`, treat it as an exact module path. Do not consult exports.
2. Otherwise, look up the bare reference in the combined export map.
3. If exported, replace it with the export's canonical module path.
4. If not exported, retain the bare value as an exact root-level module path for backward compatibility.

Examples:

| Source reference | Export registry | Stored reference |
| --- | --- | --- |
| `base/base-agent.md` | any | `base/base-agent` |
| `base-orchestrator` | `base-orchestrator -> user/base-orchestrator` | `user/base-orchestrator` |
| `base` | no `base` export | `base` |

An unresolved canonical reference is retained in the store. Existing doctor and emit behavior then reports the broken reference. Manifest targets differ: because they claim to publish a module, missing targets are immediate build errors.

## Override Scenario

Assume the default root contains:

- `base/base-agent.md`
- `base/base-orchestrator.md`, extending exact `base/base-agent.md`
- `base/orchestrator.md`, extending bare `base-orchestrator`
- `md-merger-root.yaml`, exporting `base-orchestrator: base/base-orchestrator`

Assume a later project root contains:

- `user/base-orchestrator.md`, extending exact `base/base-orchestrator.md`
- `md-merger-root.yaml`, exporting `base-orchestrator: user/base-orchestrator.md`

The combined registry maps `base-orchestrator` to `user/base-orchestrator`. Therefore, `base/orchestrator` resolves through the project implementation, while that project implementation still reaches the default implementation through its exact import. The only concrete output is `base/orchestrator.md`, containing its concrete description, the default orchestrator role, and the project subrole.

## Architecture

### Root export module

A focused `packages/cli/src/root-exports.ts` module will own manifest parsing, path normalization, and same-root target validation. It will expose a fixed manifest filename and a function that loads one root's exports from a known set of module paths.

The parser remains dependency-free and deliberately supports only the manifest schema. It must retain enough line-level information to detect duplicate keys rather than first converting the mapping into a JavaScript object.

### Import pipeline

`packages/cli/src/import.ts` will change from scan-and-write per root to two phases:

1. **Preflight:** enumerate Markdown modules for all roots, load all manifests, validate all exports, and compose the final later-root-wins alias map.
2. **Import:** parse Markdown files in root order, canonicalize their `extends` entries with the final alias map, and append records using existing same-path replacement semantics.

This ordering is essential: a module in an earlier root must see an alias exported by a later root, and no store record may be appended before every manifest passes validation.

### Downstream graph

`PromptRecord.extends` continues to contain only canonical module paths. No alias registry is passed to `resolve`, `topologicalSort`, `renderText`, `emitAll`, or `doctor`. Existing graph and merge behavior remains unchanged.

## Error Handling

- Root manifests are optional; only a missing file is ignored.
- A present but unreadable or malformed manifest fails build.
- Invalid export declarations fail build before store mutation.
- Exact or unexported bare `extends` references that do not identify a module remain canonical broken references and are reported by existing validation/render paths.
- The OpenCode plugin retains its current failure boundary: a build error is logged as plugin initialization failure, cwd is restored, and no hooks are returned.

## Testing Strategy

Implementation follows test-driven development.

### Unit coverage

- Missing and valid root manifests.
- Optional `.md` target normalization and Windows separator normalization.
- Duplicate aliases, malformed `exports`, invalid keys, path traversal, absolute targets, and missing same-root targets.
- Exact `extends` references with and without `.md`.
- Bare alias lookup and bare exact fallback.
- Later-root alias precedence.
- Build atomicity when any manifest is invalid.

### Pipeline coverage

An import/emit test will reproduce the complete override scenario and assert final merged section precedence and abstract filtering.

### Integration boundary

An OpenCode plugin test will prove that an export from a project root overrides an export from bundled defaults while exact inheritance still reaches the bundled implementation.

### Verification

Run focused package tests during development, then:

```bash
bun test
bun run typecheck
bun run bundle --cwd packages/cli
```

Because this changes inheritance across the CLI/plugin boundary, an independent review must check compatibility, canonicalization, precedence, cycle behavior, and regression coverage.

## Documentation

Update `README.md` and inheritance examples in `Justfile` where applicable to describe:

- the optional fixed root-manifest filename;
- manifest syntax and same-root target constraint;
- exact versus bare lookup;
- optional `.md` suffix normalization;
- later-root alias precedence;
- bare root-level fallback; and
- the implementation-injection override example.
