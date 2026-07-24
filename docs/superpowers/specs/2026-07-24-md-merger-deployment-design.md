# md-merger npm Deployment + OpenCode Plugin Design

**Date:** 2026-07-24  
**Status:** Approved

## Overview

Deploy `md-merger` as an npm-published CLI tool and OpenCode plugin. The package manages AI agent/skill prompts as Markdown files with hierarchical inheritance, auto-emits merged output, and registers agents directly with OpenCode's runtime via the `config` hook.

## Architecture

### Dual Package Structure

```
md-merger/
├── src/                         # CLI source
│   ├── index.ts                 # CLI entry point
│   ├── config.ts                # Config loader
│   ├── types.ts                 # Types
│   └── ... (existing modules)
├── opencode-plugin/             # OpenCode plugin package
│   ├── src/
│   │   └── index.ts             # Plugin entry, exports Plugin function
│   └── package.json
├── defaults/                    # Bundled agent/skill .md templates
│   ├── agents/
│   │   ├── orchestrator.md
│   │   ├── explorer.md
│   │   ├── oracle.md
│   │   ├── fixer.md
│   │   └── designer.md
│   └── skills/
├── package.json                 # {"name": "md-merger"}
└── .github/workflows/
    ├── md-merger-publish.yml
    └── opencode-plugin-publish.yml
```

### Runtime Flow (OpenCode Startup)

```
OpenCode loads @md-merger/opencode-plugin
  │
  ▼
Read config from $MD_MERGER_CONFIG or .md-merger/config.yaml
  │
  ▼
Merge with bundled defaults from defaults/ agents & skills
  │
  ▼
Full emit pass: resolve inheritance, write storeFile
  │
  ▼
config hook injects merged agents into OpenCode runtime
```

### Runtime Flow (CLI)

```
npx md-merger emit
  │
  ▼
Read config from $MD_MERGER_CONFIG or .md-merger/config.yaml
  │
  ▼
Full emit pass (same logic as plugin)
```

## Package Details

### Workspace Configuration

Root `package.json` MUST include a `"workspaces"` field to enable cross-package resolution:
```json
{ "workspaces": ["opencode-plugin"] }
```

### Required package.json Fields (Root)

The following fields MUST be added to the root `package.json` before publishing:
```json
{
  "name": "md-merger",
  "version": "1.0.0",
  "description": "CLI tool for managing AI agent/skill prompts as Markdown files with hierarchical inheritance",
  "type": "module",
  "bin": { "md-merger": "./dist/index.js" },
  "files": ["dist/", "defaults/", "README.md"],
  "publishConfig": { "access": "public", "provenance": true },
  "workspaces": ["opencode-plugin"],
  "license": "MIT"
}
```

### md-merger (Root)

- **Name:** `md-merger`
- **Type:** Module, zero runtime dependencies for CLI. Plugin package has deps.
- **Bin:** `./dist/index.js` (bundled via Bun)
- **Build:** `bun build ./src/index.ts --outdir ./dist --target bun --banner 'entry:#!/usr/bin/env bun'`
- **Files shipped:** `dist/`, `defaults/`, `README.md`
- **Critical:** Build target is `bun` (not `node`) — CLI uses Bun-specific APIs like `Bun.file()`. The shebang MUST be `#!/usr/bin/env bun`
- **npm publishing:** Requires `files` field to prevent shipping `tests/`, `docs/`, `.github/`

### @md-merger/opencode-plugin

Required plugin `package.json`:
```json
{
  "name": "@md-merger/opencode-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "files": ["src/"],
  "dependencies": {
    "md-merger": "workspace:*",
    "@opencode-ai/plugin": "^latest"
  }
}
```

- **Name:** `@md-merger/opencode-plugin`
- **Type:** Module
- **Package root:** `opencode-plugin/` directory within repo
- **Entry point:** `opencode-plugin/src/index.ts`
- **package.json main:** `"./src/index.ts"` (relative to plugin package root)
- **Imported by:** OpenCode's Bun runtime via `import('@md-merger/opencode-plugin')`
- **Dependencies:** `md-merger` (workspace), `@opencode-ai/plugin` (types only)
- **TS Config:** Shares root `tsconfig.json` — no separate compilation needed
- **Shipped as:** Raw `.ts` — Bun runtime transpiles at runtime, no pre-build needed
- **Version sync:** Both packages share the same version number. A pre-publish script synchronizes versions.

### Config Resolution Order

**Two distinct concepts DO NOT conflate:**

- **`DEFAULT_CONFIG`** (TS object) — runtime defaults for `maxInheritDepth`, `storeFile`, `emitDirs`, `rootDirs`
- **Bundled defaults** (npm-shipped `.md` files in `defaults/agents/` and `defaults/skills/`)

Resolution order:
1. Bundled defaults read from `defaults/` directory (shipped in npm package)
2. User config from `$MD_MERGER_CONFIG` or `.md-merger/config.yaml`
3. User config rootDirs replace, NOT merge with bundled default rootDirs
4. `DEFAULT_CONFIG` provides runtime defaults for scalar fields (`maxInheritDepth`, `storeFile`)

**How `defaults/` files are consumed:** The plugin registers bundled agent `.md` files into OpenCode's runtime config via the `config` hook. They are NOT written to disk. The plugin reads merged content (bundled + user), runs the emit pass, then injects the results into `config.agent`.

## Plugin Interface

```typescript
import type { Plugin, PluginInput } from "@opencode-ai/plugin"

// CRITICAL: Use named export, NOT default export — OpenCode may not consume defaults
export const mdMergerPlugin: Plugin = async (input: PluginInput, options?) => {
  // 1. Load + merge config (bundled defaults + user config)
  // 2. Run full emit pass (inheritance resolution, store write)
  // 3. Return config hook that injects merged agents/skills into OpenCode runtime
  return {
    config: async (cfg) => {
      // Mutate cfg.agent in place — cfg is OpenCode's runtime config object
    }
  }
}
```

**Important notes:**
- Use named export `mdMergerPlugin`, not `export default`. OpenCode resolves both but named is safer.
- The `config` hook mutates its `cfg` parameter in-place and returns `void` (not `Promise<void>` return value).
- The `config` hook signature is `config?: (input: Config) => Promise<void>` — the `Config` type here is OpenCode's internal config, not md-merger's.

## Bundled Defaults

Five core agents ship as starting templates, expandable via user config:

| Agent | Purpose |
|-------|---------|
| `orchestrator.md` | Workflow coordinator, task delegation |
| `explorer.md` | Codebase search and pattern matching |
| `oracle.md` | Technical architecture and review |
| `fixer.md` | Implementation execution |
| `designer.md` | UI/UX design |

Users add more agents/skills via their own `.md-merger/config.yaml` or by placing files in `rootDirs`.

## CI/CD

### GitHub Actions Workflows

Two workflows, both using npm Trusted Publishing (OIDC):

1. **`md-merger-publish.yml`** — Publishes root `md-merger` package
2. **`opencode-plugin-publish.yml`** — Publishes `@md-merger/opencode-plugin`

- **Trigger:** `v*` tag push or manual `workflow_dispatch`
- **Auth:** npm OIDC trusted publishing (no secrets)
- **Build:** Bun for compilation, Node.js for `npm publish --provenance`
- **Permission:** Free for public repos

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Config missing | Silently falls back to bundled defaults + DEFAULT_CONFIG |
| Inheritance depth exceeded | Skip affected file, log warning |
| File I/O error during emit | Catch and log, allow partial emission |
| Plugin load failure | Return gracefully with defaults only, never crash host |

## Testing Strategy

- Config merging: bundled defaults → user config override
- Emit pass: inheritance resolution, store file output
- Plugin hooks: config hook injects correct agent definitions
- CLI: bundle output runs under Bun (since CLI uses Bun-specific APIs like `Bun.file()`)
- CI: full publish dry-run validates package integrity

## Implementation Context for Fresh Sessions

### Current Project State
- **Repo:** `md-merger` (formerly evo-ai), monorepo with `src/` (CLI) + `opencode-plugin/` (plugin)
- **Runtime:** Bun. Zero npm dependencies — all parsing (including YAML) is hand-rolled
- **Config:** Hand-rolled YAML parser reads `.md-merger/config.yaml` or `$MD_MERGER_CONFIG` env var
- **Entry point:** `src/index.ts` with `#!/usr/bin/env bun` shebang
- **Existing CLI commands:** `emit`, `build`, `render`, `stats`, `doctor`
- **Config schema** (`src/types.ts`): `Config` interface with `project`, `version`, `maxInheritDepth`, `storeFile`, `emitDirs`, `rootDirs`

### How OpenCode Loads Plugins
1. Plugin listed in `opencode.json` → `"plugin": ["@md-merger/opencode-plugin"]`
2. OpenCode runs `bun install @md-merger/opencode-plugin` at startup, caches in `~/.cache/opencode/node_modules/`
3. Imports the package via `import('@md-merger/opencode-plugin')` — resolves to `package.json` `main` field
4. Expects a **default export** or **named export** conforming to `Plugin` type: `(input: PluginInput) => Promise<Hooks>`
5. Runs **inside OpenCode's Bun server process** — not a subprocess
6. Plugins receive `PluginInput` context: `{ client, project, directory, worktree, serverUrl, $ (BunShell), experimental_workspace }`

### Key OpenCode Hook Types
- **`config` hook:** Modifies OpenCode's runtime config object in place. Used by oh-my-opencode-slim to inject agents.
- **`tool` hook:** Registers custom tool definitions.
- **`event` hook:** Listen to lifecycle events.
- **`chat.message` / `chat.params` / `chat.headers`:** Intercept LLM calls.

### Plugin Config Hook Pattern (from oh-my-opencode-slim)
- Agents are constructed as prompt strings in TypeScript
- Registered via the `config` hook callback into the runtime `opencodeConfig.agent` object
- Resolution order: Built-in defaults → user config → preset overrides
- **Agents are NOT written to disk** — they are injected programmatically into the config object

### Build Targets
- CLI: `bun build ./src/index.ts --outdir ./dist --target bun --banner 'entry:#!/usr/bin/env bun'` — target MUST be `bun` because CLI uses `Bun.file()`. Using `--target node` will crash at runtime.
- Plugin: Shipped as raw `.ts` — Bun runtime imports directly, no build step needed

### Plugin Export Pattern
**CRITICAL:** OpenCode loads plugins by resolving both default and named exports. Use named export to be safe:
```typescript
export const mdMergerPlugin: Plugin = async (input, options) => { ... }
```
Do NOT use only default export — some OpenCode versions may not consume it.

### npm Publishing Requirements
- `publishConfig: { access: "public", provenance: true }` in both package.json files
- OIDC trusted publishing — no npm token secrets
- `--provenance` flag requires `actions/setup-node`, not `bun publish`
- Both packages share the same version number, published together on `v*` tags

## References

- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [Bun build docs](https://bun.sh/docs/bundler)
- [OpenCode Plugin System](https://opencode.ai/docs/plugins)
- [OpenCode Plugin Types](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts)
- [oh-my-opencode-slim agent registration](C:\Users\Danni\Documents\Git\ai-vault\opencode\plugins\oh-my-opencode-slim.md)
