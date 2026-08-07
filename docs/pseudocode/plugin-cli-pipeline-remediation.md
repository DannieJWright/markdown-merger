# Plugin CLI Pipeline Remediation Pseudocode Plan

**Source:** `docs/superpowers/specs/2026-08-04-plugin-cli-pipeline-remediation-design.md`

**Goal:** Route plugin defaults and project modules through one CLI-owned build/emit pipeline, then expose only emitted concrete agents to OpenCode.

**Architecture:** `packages/cli` remains the only owner of module discovery, frontmatter parsing, ordered-root precedence, inheritance resolution, abstract filtering, type routing, and Markdown emission. `packages/opencode-plugin` directly calls the CLI package's exported APIs, prepends dynamically discovered default roots to the user's configuration roots, captures emitted agent prompts, and mutates OpenCode's supplied agent configuration. No plugin CLI subprocess, raw Markdown loader, or separate fallback implementation remains.

**Tech Stack:** TypeScript, Bun, `bun:test`, Node filesystem APIs, OpenCode plugin API.

## Global Constraints

- `packages/cli` is the sole Markdown-processing core; the plugin must not traverse raw Markdown, parse frontmatter, resolve inheritance, or decide abstract versus concrete status.
- The plugin calls exported CLI package APIs directly; it must not invoke commands, spawn a CLI subprocess, or simulate command-line interactions.
- The cwd-resolved user configuration is authoritative: preserve `rootDirs`, every `emitDirs` route, `storeFile`, `project`, `version`, `maxInheritDepth`, and other loaded settings.
- Every immediate directory under the installed plugin package's `defaults/` directory is prepended to the configured project roots dynamically; non-directory entries are ignored.
- Bundled default roots are processed first and project roots second; later project modules override earlier defaults with the same module path.
- Every `abstract: true` module is inheritance-only and is never emitted or registered, regardless of source root.
- Concrete module output is selected from its `type` frontmatter via `emitDirs.<type>`; source folder names do not select output directories.
- Nested module paths are preserved in emitted directories and OpenCode agent keys; flattened output naming is removed.
- Resolved module paths are assumed unique; collision handling beyond later-root override semantics is deferred to a separate follow-up.
- The plugin reads only emitted agent outputs from `emitDirs.agent` for OpenCode `agent` injection; non-agent output routes remain user-configured but are not injected as agents.
- When no user configuration file exists, the CLI default configuration must route `type: agent` to `<cwd>/.opencode/agents/` and `type: skill` to `<cwd>/.opencode/skills/`. A user configuration may replace these routes, including with global paths.
- When an emitted plugin agent key already exists in OpenCode's supplied `agent` configuration, the plugin replaces that entry with its generated `{ prompt: content }` value.
- Do not create temporary directories, alternate stores, alternate output directories, CLI processes, or runtime dependencies.
- Existing `just build-local` and `prepublishOnly` defaults-copy mechanisms remain unchanged.
- Do not modify npm publish workflows or the `prepublishOnly` script.

## File Structure

- `packages/cli/src/import.ts` — import ordered source roots with later-root precedence.
- `packages/cli/src/emit.ts` — emit concrete module Markdown while preserving nested module paths under each type route.
- `packages/cli/src/config.ts` — clone default nested configuration before cwd-relative path resolution.
- `packages/cli/src/types.ts` — define no-config agent and skill output routes.
- `packages/cli/tests/unit/import.test.ts` — prove later-root precedence.
- `packages/cli/tests/unit/emit.test.ts` — prove abstract filtering and nested type-routed output paths.
- `packages/opencode-plugin/src/index.ts` — direct CLI API integration, dynamic defaults-root discovery, emitted-agent prompt capture, and OpenCode config mutation.
- `packages/opencode-plugin/tests/plugin.test.ts` — plugin boundary regressions for defaults, project modules, precedence, abstract filtering, config mutation, and process isolation.
- `AGENTS.md` — durable project instructions for architecture, module semantics, testing, validation, and agent workflow.
- `README.md` — current root-precedence and command-surface documentation.

---

### Task 1: Ordered import precedence and nested emission paths

**Files:**
- Create: none
- Modify: `packages/cli/src/import.ts:24-89`
- Modify: `packages/cli/src/emit.ts:120-180`
- Modify: `packages/cli/src/config.ts:35-136`
- Modify: `packages/cli/src/types.ts:39-44`
- Modify: `packages/cli/tests/unit/import.test.ts`
- Modify: `packages/cli/tests/unit/emit.test.ts`
- Modify: `packages/cli/tests/unit/config.test.ts`
- Delete: none
- Test: `packages/cli/tests/unit/import.test.ts` and `packages/cli/tests/unit/emit.test.ts`

**Interfaces:**
- Consumes: `build(rootDirs: string[], storePath: string, project: string) -> Promise<void>` and `emitAll(storePath: string, emitDirs: Record<string, string>, config: Config, dryRun: boolean) -> Promise<string[]>`.
- Produces: later-root-wins imported records, nested emitted paths that the plugin can convert to slash-delimited OpenCode agent keys, and independently cloned no-config settings for every `loadConfig()` call.

**Behaviors to test:**

```text
GIVEN defaultsRoot and projectRoot each define the same module path with distinct content
WHEN  build([defaultsRoot, projectRoot], storePath, project) completes
THEN  ASSERT the latest record for that module path contains projectRoot content

GIVEN an abstract module and a concrete module at nested path base/core/plan-o-strator with type agent
WHEN  emitAll(storePath, { agent: outputRoot }, config, false) completes
THEN  ASSERT no abstract-module path is emitted
AND   ASSERT the concrete path equals outputRoot/base/core/plan-o-strator.md

GIVEN no config file and two distinct working directories
WHEN  loadConfig() is called once from each directory
THEN  ASSERT each result resolves emitDirs.agent and emitDirs.skill beneath its own cwd
AND   ASSERT the second result contains no absolute path derived from the first cwd
AND   ASSERT DEFAULT_CONFIG remains unchanged
```

**Logic:**

```text
FUNCTION build(rootDirs: string[], storePath: string, project: string) -> Promise<void>:
    FOR EACH rootDir IN rootDirs IN ORDER:
        FOR EACH markdown file discovered recursively beneath rootDir:
            modulePath = path relative to rootDir without markdown extension
            parse module frontmatter and content
            append or update module record in storePath
    ENSURE a later record for the same modulePath has a greater version than an earlier record

FUNCTION emitAll(storePath: string, emitDirs: Record<string, string>, config: Config, dryRun: boolean) -> Promise<string[]>:
    records = read and deduplicate store records by latest version per module path
    FOR EACH resolved record:
        IF record is abstract:
            SKIP
        targetRoot = emitDirs[record.type]
        IF targetRoot is absent:
            SKIP
        outputPath = targetRoot joined with record.modulePath plus markdown extension
        create outputPath parent directories
        write resolved merged Markdown to outputPath
        collect outputPath
    RETURN collected output paths

FUNCTION loadConfig() -> Promise<Config>:
    parsed = load user config or empty object
    defaults = new config value with cloned emitDirs and cloned rootDirs
    config = merge defaults with parsed config
    resolve config store, output, and root paths against current cwd
    RETURN config without mutating DEFAULT_CONFIG nested values
```

**Open questions:** none

---

### Task 2: Unified plugin integration over CLI APIs

**Files:**
- Create: none
- Modify: `packages/opencode-plugin/src/index.ts:1-88`
- Modify: `packages/opencode-plugin/tests/plugin.test.ts`
- Delete: raw `loadBundledDefaults` implementation and tests that directly exercise raw bundled Markdown loading
- Test: `packages/opencode-plugin/tests/plugin.test.ts`

**Interfaces:**
- Consumes: `loadConfig() -> Promise<Config>`, `build(rootDirs: string[], storePath: string, project: string) -> Promise<void>`, and `emitAll(storePath: string, emitDirs: Record<string, string>, config: Config, dryRun: boolean) -> Promise<string[]>` from `@md-merger/cli`.
- Consumes: `PluginInput.directory: string` and OpenCode `config(opencodeConfig) -> Promise<void>` hook semantics.
- Produces: `createMdMergerPlugin(defaultsDir: AbsolutePath) -> Plugin`, an internal construction seam used by tests without extending `PluginInput`.
- Produces: `mdMergerPlugin: Plugin`, constructed with the installed package defaults directory.

**Behaviors to test:**

```text
GIVEN plugin defaults contains immediate directories agents and skills
AND   the user configuration has project rootDirs and emitDirs.agent
WHEN  mdMergerPlugin({ directory }) initializes
THEN  ASSERT build receives default roots before project rootDirs
AND   ASSERT build and emitAll are invoked through the CLI package API once
AND   ASSERT no raw bundled-default traversal helper remains

GIVEN no .md-merger configuration file exists in the OpenCode cwd
WHEN  mdMergerPlugin({ directory }) initializes
THEN  ASSERT default emitDirs.agent equals <cwd>/.opencode/agents/
AND   ASSERT default emitDirs.skill equals <cwd>/.opencode/skills/
AND   ASSERT concrete bundled type agent output is emitted and injected

GIVEN a bundled abstract agent and concrete base/core/plan-o-strator
WHEN  the returned config hook receives an empty OpenCode config object
THEN  ASSERT the abstract key is absent
AND   ASSERT agent[base/core/plan-o-strator].prompt contains inherited base content

GIVEN a concrete project agent extends a bundled abstract base
WHEN  the returned config hook runs
THEN  ASSERT the concrete project agent key has merged inherited content

GIVEN representative bundled abstract base Markdown and a concrete project child extending it
WHEN  the plugin pipeline builds, emits, and runs the config hook
THEN  ASSERT the child prompt contains both inherited bundled content and project content

GIVEN a project module shares a module path with a bundled module
WHEN  the returned config hook runs
THEN  ASSERT the injected prompt contains project content rather than bundled content

GIVEN a project module has abstract true
WHEN  the returned config hook runs
THEN  ASSERT its key is absent

GIVEN emitted agent files have nested paths below emitDirs.agent
WHEN  the returned config hook runs
THEN  ASSERT each OpenCode key equals the slash-delimited relative path without markdown extension

GIVEN the supplied OpenCode config already contains an agent with an emitted plugin key
WHEN  the returned config hook runs
THEN  ASSERT that agent entry equals the plugin-generated prompt entry

GIVEN plugin initialization changes cwd and tests configure MD_MERGER_CONFIG
WHEN  initialization completes or build fails after cwd changed successfully
THEN  ASSERT cwd and MD_MERGER_CONFIG are restored

GIVEN no user config and representative concrete agent and skill defaults
WHEN  the plugin pipeline runs
THEN  ASSERT the agent emits beneath <cwd>/.opencode/agents and is injected
AND   ASSERT the skill emits beneath <cwd>/.opencode/skills and is not injected as an agent
```

**Logic:**

```text
FUNCTION discoverDefaultRoots(defaultsDir: AbsolutePath) -> AbsolutePath[]:
    IF defaultsDir does not exist:
        RETURN empty array
    entries = direct children of defaultsDir with directory metadata
    RETURN sorted absolute paths for entries that are directories

FUNCTION createMdMergerPlugin(defaultsDir: AbsolutePath) -> Plugin:
    RETURN plugin function accepting only declared PluginInput:
        originalCwd = current working directory
        TRY:
            change working directory to input.directory
            userConfig = await loadConfig()
            defaultRoots = await discoverDefaultRoots(defaultsDir)
            combinedConfig = copy userConfig with rootDirs equal defaultRoots followed by userConfig.rootDirs
            await build(combinedConfig.rootDirs, combinedConfig.storeFile, combinedConfig.project)
            emittedPaths = await emitAll(combinedConfig.storeFile, combinedConfig.emitDirs, combinedConfig, false)
            agentPrompts = empty map
            FOR EACH emittedPath in emittedPaths beneath combinedConfig.emitDirs.agent:
                key = slash-delimited relative path from combinedConfig.emitDirs.agent without markdown extension
                agentPrompts[key] = read emittedPath content
            RETURN config hook that replaces each opencodeConfig.agent[key] with agentPrompts[key]
        CATCH error:
            log plugin initialization failure
            RETURN empty hooks
        FINALLY:
            restore originalCwd

mdMergerPlugin = createMdMergerPlugin(installed package defaults directory)
```

**Open questions:** none

---

### Task 3: Repository guidance and documentation consistency

**Files:**
- Create: `AGENTS.md`
- Modify: `README.md:233` and root command documentation sections
- Delete: none
- Test: documentation content review and plugin regression tests from Task 2

**Interfaces:**
- Consumes: the final CLI precedence and nested-emission behavior from Task 1.
- Produces: root agent instructions and corrected README guidance that preserve the architecture contract.

**Behaviors to test:**

```text
GIVEN AGENTS.md
WHEN  reviewed against the remediation architecture
THEN  ASSERT it states CLI-only Markdown processing, plugin integration-only responsibility, defaults-first/project-later precedence, abstract exclusion, type-to-emitDirs routing, nested output/key preservation, boundary testing, generated-artifact rules, scoped validation, test isolation, review, parallel-writer isolation, and dependency restraint

GIVEN README.md
WHEN  reviewed after this remediation
THEN  ASSERT it says later roots override earlier same-path modules
AND   ASSERT it names only root commands actually defined by root package.json plus package-scoped and just commands
```

**Logic:**

```text
DOCUMENT AGENTS.md:
    SECTION architecture:
        STATE CLI owns all Markdown parsing, import, merge, filtering, and emission
        STATE plugin only integrates emitted agent output with OpenCode
    SECTION module resolution:
        STATE dynamic plugin defaults roots precede project roots
        STATE later roots override earlier same module paths
        STATE abstract modules are inheritance-only and never emitted
        STATE concrete output route is selected by type through emitDirs.<type>
        STATE absent user configuration defaults type agent output to <cwd>/.opencode/agents/ and type skill output to <cwd>/.opencode/skills/
        STATE nested module paths are preserved in output and OpenCode keys
        STATE resolved module paths are assumed unique and broader collision handling is deferred
        STATE generated plugin agents replace same-key OpenCode agent entries
    SECTION quality workflow:
        STATE boundary tests cover roots through OpenCode config mutation
        STATE generated artifacts are not committed
        STATE canonical scoped validation commands
        STATE temporary test state must be restored
        STATE cross-cutting work records decisions and validation evidence
        STATE high-risk changes receive independent review
        STATE concurrent writers use isolation or non-overlapping ownership
        STATE runtime dependencies require documented justification and supply-chain review

DOCUMENT README.md:
    REPLACE first-root-wins wording with later-root-wins wording
    NAME only verified root, package-scoped, and just command surfaces
```

**Open questions:** none
