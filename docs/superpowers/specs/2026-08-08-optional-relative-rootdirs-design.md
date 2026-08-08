# Optional Relative `rootDirs` Design

## Goal

Allow a global `MD_MERGER_CONFIG` to provide required absolute import roots and optional project-local relative roots. A project that does not contain a configured relative root must still build successfully.

## Scope

- Preserve whether each configured `rootDirs` entry was written as relative or absolute.
- Continue resolving relative entries against the process working directory.
- Before scanning, skip a missing relative root and write a warning to stderr.
- Continue to fail when an absolute root is missing, preserving the current replacement-store safety behavior.
- Document the distinction and add focused regression coverage.

## Non-goals

- No change to root processing order, later-root override precedence, aliases, inheritance, module naming, or emission.
- No structured warning field in the `build()` API.
- No change to the requirement that an existing root be a valid scan target.

## Design

### Configuration representation

`loadConfig()` will retain root-origin information internally instead of reducing every configured root to an indistinguishable resolved string. The build pipeline receives each resolved root together with whether it originated from a relative declaration.

Absolute root declarations remain resolved unchanged; relative declarations remain resolved from `process.cwd()` as they are today.

### Build behavior

Before recursively scanning a configured root:

1. If it exists, process it using the current logic.
2. If it is missing and was declared relative, write a concise warning to stderr identifying the declared/resolved root, then skip it.
3. If it is missing and was declared absolute, retain the existing failure behavior and do not replace the existing store.

Existing roots continue to be processed in their original order, so all current precedence and inheritance behavior remains intact.

### Error and warning contract

- Skipped optional roots produce stderr output only.
- A successful build remains successful after a skipped relative root.
- The public `build()` result shape remains unchanged.
- Missing absolute roots remain errors.

## Acceptance cases

1. A config containing an existing absolute root and a nonexistent relative root builds modules from the absolute root, writes a warning to stderr, and does not throw.
2. A nonexistent absolute root still throws and preserves any pre-existing store snapshot.
3. An existing relative root is still scanned normally.
4. A relative root resolves from the current working directory, not from the global config file's directory.
5. Multiple roots preserve their configured order and later-root override semantics after optional roots are skipped.

## Testing

Use TDD:

1. Add failing focused unit/pipeline tests covering skipped missing relative roots, stderr warning output, and unchanged missing-absolute-root failure behavior.
2. Implement the smallest configuration/build-path change that makes those tests pass.
3. Run `bun test --cwd packages/cli` and `bun run typecheck`; expand to `bun test` if the plugin boundary is affected.

## Execution requirements

- Use the `subagent-driven-development` skill while executing independent implementation tasks.
- Do not activate `deepwork`; this is a focused CLI behavior change without the high-risk, multi-phase dependency profile that skill requires.
