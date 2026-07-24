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

### md-merger (Root)

- **Name:** `md-merger`
- **Type:** Module, zero dependencies
- **Bin:** `./dist/index.js` (bundled via Bun)
- **Build:** `bun build ./src/index.ts --outdir ./dist --target node --banner 'entry:#!/usr/bin/env node'`
- **Files shipped:** `dist/`, `defaults/`, `README.md`

### @md-merger/opencode-plugin

- **Name:** `@md-merger/opencode-plugin`
- **Type:** Module
- **Main:** `./src/index.ts` (imported directly by OpenCode's Bun runtime)
- **Dependencies:** `md-merger` (workspace), `@opencode-ai/plugin` (types only)

### Config Resolution Order

1. Bundled defaults (shipped in npm `defaults/` directory)
2. User config (`$MD_MERGER_CONFIG` → `.md-merger/config.yaml`)
3. User config overrides all bundled defaults of the same name

## Plugin Interface

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export default async (input: PluginInput) => {
  // 1. Load + merge config
  // 2. Run full emit pass (inheritance resolution, store write)
  // 3. Return config hook that injects merged agents/skills into OpenCode runtime
  return {
    config: async (cfg) => {
      // Inject agents into cfg.agent
    }
  }
}
```

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
- CLI: bundle output runs under Node.js without Bun
- CI: full publish dry-run validates package integrity

## References

- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [Bun build docs](https://bun.sh/docs/bundler)
- [OpenCode Plugin System](https://opencode.ai/docs/plugins)
- [OpenCode Plugin Types](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts)
- [oh-my-opencode-slim agent registration](C:\Users\Danni\Documents\Git\ai-vault\opencode\plugins\oh-my-opencode-slim.md)
