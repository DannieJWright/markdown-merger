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
│   ├── api.ts                   # Public library API (to be created)
│   ├── config.ts                # Config loader
│   ├── types.ts                 # Types
│   └── ... (existing modules)
├── opencode-plugin/             # OpenCode plugin package (to be created)
│   ├── src/
│   │   └── index.ts             # Plugin entry, exports Plugin function
│   └── package.json
├── defaults/                    # Bundled agent/skill .md templates (to be created)
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
- **Build:** `bun build ./src/index.ts --outdir ./dist --target node --banner 'entry:#!/usr/bin/env node'`
- **Files shipped:** `dist/`, `defaults/`, `README.md`
- **Note:** Build target is `node` — the compiled output runs fine under Bun. The shebang is `#!/usr/bin/env node` for compatibility. CLI source uses `Bun.file()` (Bun runtime API), which works because Bun provides it regardless of build target.
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

**Current code** (`src/config.ts`, line 119-122):
```typescript
const config: Config = {
  ...DEFAULT_CONFIG,
  ...parsed,
} as Config;
```
This is a simple two-way spread: `DEFAULT_CONFIG` (hardcoded TS object with `maxInheritDepth`, `storeFile`, `emitDirs`, `rootDirs`) is the base, then the parsed user config is spread on top. There is no 4-step merge in the current code.

**Target state (will be implemented):** Bundled defaults from `defaults/` will serve as the base layer of agent/skill templates. User config will merge on top via the same spread mechanism. The resolution will be:
1. Bundled defaults from `defaults/` directory (shipped in npm package, **to be created**)
2. User config from `$MD_MERGER_CONFIG` or `.md-merger/config.yaml` overrides on top

**How `defaults/` files will be consumed:** The plugin will register bundled agent `.md` files into OpenCode's runtime config via the `config` hook. They are NOT written to disk. The plugin reads merged content (bundled + user), runs the emit pass, then injects the results into the OpenCode runtime config.

## Plugin Interface

```typescript
import type { Plugin, PluginInput } from "@opencode-ai/plugin"

// CRITICAL: Use named export, NOT default export — OpenCode may not consume defaults
export const mdMergerPlugin: Plugin = async (input: PluginInput) => {
  // 1. Load + merge config (bundled defaults + user config)
  // 2. Run full emit pass (inheritance resolution, store write)
  // 3. Return config hook that injects merged agents/skills into OpenCode runtime
  return {
    config: async (opencodeConfig: OpencodeConfig) => {
      // Mutate opencodeConfig.agent in place — this is OpenCode's runtime config object
    }
  }
}
```

**Important notes:**
- Use named export `mdMergerPlugin`, not `export default`. OpenCode resolves both but named is safest.
- The `config` hook mutates its parameter in-place.
- The `config` hook type alias `OpencodeConfig` distinguishes OpenCode's internal config type from md-merger's own `Config` type (defined in `src/types.ts`). Do NOT import OpenCode's type as `Config` — it will collide with md-merger's `Config`.

## Bundled Defaults

**Status: To be created.** The `defaults/` directory does not exist yet. It will be created as part of this deployment design.

The `defaults/` directory will contain five core agent templates shipped as starting prompts. These are new files, not existing content.

### Agent Template Files

| File | Purpose |
|------|---------|
| `defaults/agents/orchestrator.md` | Workflow coordinator, task delegation |
| `defaults/agents/explorer.md` | Codebase search and pattern matching |
| `defaults/agents/oracle.md` | Technical architecture and review |
| `defaults/agents/fixer.md` | Implementation execution |
| `defaults/agents/designer.md` | UI/UX design |

Users add more agents/skills via their own `.md-merger/config.yaml` or by placing files in `rootDirs`.

### Skills Directory

The `defaults/skills/` subdirectory is reserved for bundled skill templates. It will be created alongside the agents directory but may ship empty initially.

## Plugin Import Chain

The plugin (`opencode-plugin/src/index.ts`) needs to import utilities from `md-merger`. Currently `src/index.ts` is a CLI entry point (run + process.argv handling), not a library. A library export surface is needed.

### New `src/api.ts` (to be created)

Create `src/api.ts` as the public library interface. This file will export the symbols the plugin needs:

```typescript
// src/api.ts — public library API
export { loadConfig } from "./config";
export { emitAll } from "./emit";       // or wherever the emit function lives
export type { Config } from "./types";
export { DEFAULT_CONFIG } from "./types";
```

### `package.json` `exports` field (to be added)

Add an `exports` field to root `package.json` to allow library-style imports alongside the CLI bin:

```json
{
  "exports": {
    ".": {
      "import": "./src/api.ts",
      "types": "./src/api.ts"
    },
    "./package.json": "./package.json"
  }
}
```

### What the plugin imports

The plugin (`opencode-plugin/src/index.ts`) will import from the `md-merger` package:

```typescript
import { loadConfig, emitAll, DEFAULT_CONFIG } from "md-merger";
import type { Config } from "md-merger";
```

Workspace resolution via `"md-merger": "workspace:*"` in the plugin's `package.json` will resolve these to the local `src/api.ts`.

### Bun workspace protocol compatibility

Bun supports `workspace:*` protocol for monorepo dependency resolution. When publishing to npm, ensure the plugin's `package.json` has `"md-merger": "^1.0.0"` (or appropriate semver range) instead of `workspace:*`. A pre-publish replacement script or two separate `package.json` variants (dev vs publish) handle this.

## Delta from Current State

### Root `package.json` changes needed

The current root `package.json` is minimal. These fields MUST be added:

```diff
 {
   "name": "md-merger",
-  "version": "0.1.0",
+  "version": "1.0.0",
+  "description": "CLI tool for managing AI agent/skill prompts as Markdown files with hierarchical inheritance",
   "type": "module",
   "bin": {
-    "md-merger": "./src/index.ts"
+    "md-merger": "./dist/index.js"
   },
+  "exports": {
+    ".": { "import": "./src/api.ts", "types": "./src/api.ts" },
+    "./package.json": "./package.json"
+  },
+  "files": ["dist/", "defaults/", "README.md"],
+  "publishConfig": { "access": "public", "provenance": true },
+  "workspaces": ["opencode-plugin"],
+  "license": "MIT",
   "scripts": { ... }
 }
```

### Plugin `package.json` (new file)

`opencode-plugin/package.json` does not exist yet. Create it with the content specified in the "Package Details" section above.

### `tsconfig.json` changes needed

Add `opencode-plugin/**/*.ts` to the `include` array so the plugin gets type-checked:

```diff
-  "include": ["src/**/*.ts", "tests/**/*.ts"],
+  "include": ["src/**/*.ts", "tests/**/*.ts", "opencode-plugin/**/*.ts"],
```

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

Both the CLI and the plugin run inside Bun runtimes (local CLI via shebang, plugin via OpenCode's Bun server). Use `--target node` for maximum compatibility — `node` target produces standard ESM that Bun can run perfectly fine. The earlier concern about `Bun.file()` only applies if the BUILT output tries to polyfill Bun globals away; with `--target node` and `--external bun:` (or no external config since Bun ships its own globals), the output works.

**Concrete build command for root md-merger package:**
```bash
bun build ./src/index.ts --outdir ./dist --target node --banner "entry:#!/usr/bin/env node"
```

**Plugin:** Shipped as raw `.ts` — Bun runtime imports directly, no build step needed.

**Full publish sequence (example):**
```bash
# Build the CLI
bun build ./src/index.ts --outdir ./dist --target node --banner "entry:#!/usr/bin/env node"

# Verify build
node ./dist/index.js --help

# Publish root package
npm publish --provenance

# Publish plugin package
cd opencode-plugin && npm publish --provenance
```

### Plugin Export Pattern
**CRITICAL:** OpenCode loads plugins by resolving both default and named exports. Use named export to be safe:
```typescript
export const mdMergerPlugin: Plugin = async (input: PluginInput) => { ... }
```
Do NOT use only default export — some OpenCode versions may not consume it. The Plugin type signature is `(input: PluginInput) => Promise<Hooks>` — there is no second `options` parameter.

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
