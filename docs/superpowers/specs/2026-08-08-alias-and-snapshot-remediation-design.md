# Alias exposure and snapshot build remediation

## Goal

Ensure root-export aliases expose exactly the intended OpenCode agent and make each build reflect the current source roots without stale store records or stale managed output files.

## Agent exposure

The CLI build result will distinguish:

- `exports`: the final alias-to-module map after later roots replace earlier aliases.
- `exportedModules`: every canonical module targeted by any valid root manifest in the build, including targets superseded by a later root's same alias.

The OpenCode plugin will use `exports` to choose the prompt exposed under each alias. It will never expose a canonical path-derived key for a module in `exportedModules`.

For example, if defaults export `plan-o-strator` from `base/core/plan-o-strator` and a later project root exports it from `base/plan-o-strator`, the plugin injects only:

```text
plan-o-strator -> base/plan-o-strator prompt
```

Neither canonical module path is injected. This affects only OpenCode agent keys; inheritance resolution, module identity, store names, and emitted paths remain canonical.

## Transactional snapshot builds

Every CLI `build()` will replace the prior store with a complete snapshot of the currently configured roots rather than appending to stale records.

The build will:

1. Scan all roots and validate every root manifest before writing replacement data.
2. Read the previous latest records needed to preserve existing behavior for modules that remain present, including retaining a module's prior `type` when current frontmatter omits it.
3. Write the complete new snapshot to a uniquely named temporary file in the store's directory.
4. Atomically replace the configured store only after the snapshot has been built successfully.
5. Remove the temporary file in a `finally` block on success or failure.

Deleted or moved source modules will therefore disappear from the current store. Existing version history is not retained across successful builds because the store represents the current complete source snapshot.

If snapshot preparation fails, the existing store remains unchanged. `build()` throws a contextual error stating that the build failed and the existing store was not updated. If final replacement fails, it throws a distinct contextual error stating that the snapshot was prepared but replacement failed. The CLI and plugin's existing error boundaries surface these errors to users. Successful builds add no new routine logging.

Temporary files must be removed after all success and failure paths, including scan, parse, write, and replacement failures.

## Managed emitted-file cleanup

Emission will maintain a manifest of paths previously managed by md-merger. After determining the current successful emitted set, it will remove only previously managed files that are no longer current.

- Unknown files in configured output directories are never removed.
- Dry runs do not create, modify, or remove files or the managed-output manifest.
- If a current module fails to render, its prior managed file is retained rather than classified as obsolete.
- The managed-output manifest is updated only after emission and cleanup complete successfully.
- Manifest updates use a temporary same-directory file and guaranteed cleanup on failure, matching the store's transactional guarantees.
- Cleanup failures are reported with the affected path and do not silently claim a successful complete snapshot.

The managed-output manifest will live beside the configured store so it can cover all routed output directories without placing metadata in user output trees.

## Non-goals

- Do not change root-export manifest grammar or validation.
- Do not change `extends` normalization, canonical inheritance resolution, merging, abstract filtering, or type routing.
- Do not clear entire output directories.
- Do not remove output files that were not recorded as managed by md-merger.
- Do not add a configuration option or runtime dependency.

## TDD acceptance cases

1. Defaults export `plan-o-strator` from `base/core/plan-o-strator`; a later project root exports it from `base/plan-o-strator`; the plugin injects exactly one relevant key, `plan-o-strator`, containing the project prompt.
2. Both the current and superseded exported canonical paths are absent from OpenCode's agent map.
3. Removing or moving a source module and rebuilding removes its record from the store.
4. A failed scan, manifest validation, parse, snapshot write, or replacement leaves the prior store unchanged and removes the temporary file.
5. Failure messages state whether snapshot preparation or replacement failed and that the existing store was not updated.
6. A successful emit removes obsolete previously managed files.
7. Emit preserves unknown files and prior files for current modules that fail to render.
8. Dry-run emission leaves outputs and the managed-output manifest unchanged.
9. Failed managed-manifest updates remove temporary files and report failure.
10. Existing inheritance, alias resolution, abstract filtering, type routing, plugin replacement, and type-preservation tests continue to pass.

## Delivery constraints

Implementation must follow test-driven development: add focused failing tests before each production change, observe the expected failures, implement the smallest correct behavior, and rerun focused then cross-package checks.

Execution must invoke the `subagent-driven-development` skill. The `deepwork` skill is not required unless implementation reveals broader high-risk or multi-phase dependencies.
