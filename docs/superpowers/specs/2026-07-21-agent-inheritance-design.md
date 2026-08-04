# Agent Inheritance Plugin — Design Spec

**Date:** 2026-07-21
**Status:** Approved

## Overview

A Bun/TypeScript CLI tool for composing OpenCode agent markdown definitions via
section-aware inheritance. Users define base agents and traits, then specialized
agents that `extends` them. The tool resolves the full inheritance chain, merges
sections (override, append, remove), and emits fully combined markdown files
ready for OpenCode consumption.

## Architecture

```
agents-root/                          # User's .md agent definitions
  system/
    base.md                           # extends: [] (leaf base)
    traits/
      caution.md                      # extends: [] (standalone trait)
  reviewers/
    security-reviewer.md              # extends: [system/base, system/traits/caution]

                          ↓ `evo build`

.evo/
  config.yaml                         # project config
  prompts.jsonl                       # generated JSONL store (git-ignored)

                          ↓ `evo emit`

output-agents/                        # Fully resolved .md files
  system-base.md
  system-traits-caution.md
  reviewers-security-reviewer.md
```

### Commands

- **`evo build`** — scans root dirs, parses `.md` files (frontmatter + section
  headings), imports/updates records into `prompts.jsonl`.
- **`evo emit [--dry-run]`** — resolves all agents' inheritance chains from the
  JSONL store, writes merged `.md` to `emitDir`.
- **`evo render <module>`** — resolves and prints a single agent's merged output.
- **`evo config show|set|unset`** — YAML config management.
- **`evo stats`** — agent counts, inheritance depths.
- **`evo doctor`** — health checks (broken references, depth violations).

## Project Structure

```
evo-ai/
  .evo/
    config.yaml                       # project config
  agents-root/                        # source .md agents
  .gitignore
  src/
    index.ts                          # CLI entry + command router
    config.ts                         # YAML config loader/writer
    store.ts                          # JSONL read/write
    resolve.ts                        # Inheritance resolution (adapts Canopy)
    import.ts                         # Markdown → JSONL importer
    emit.ts                           # Resolved prompt → .md emitter
    frontmatter.ts                    # YAML frontmatter parse/serialize
    types.ts                          # Data models
  package.json
  tsconfig.json
  bunfig.toml
```

## Configurable Paths

All paths are configurable in `.evo/config.yaml`:

- `dataDir: .evo` — where config + JSONL store live (default: `.evo`)
- `emitDir: output-agents` — generated `.md` output directory
- `rootDirs: [agents-root]` — source agent directories to scan
- `maxInheritDepth: 5` — maximum inheritance chain depth (configurable)

```yaml
project: my-project
version: "1"
maxInheritDepth: 5
emitDir: output-agents
rootDirs:
  - agents-root
```

`prompts.jsonl` is added to `.gitignore` as it is a generated artifact.

## Composition Model

### Module-Style Resolution

- `extends: [system/base, system/traits/caution]` — paths relative to root dirs
- No `.md` extension in references; resolved automatically
- Multiple root dirs act as independent namespaces; first match wins
- A single `extends` field, array of module paths (no separate `mixins` field)

### Section Merging Rules

Derived from Canopy's `render.ts` composition logic (see Attribution):

1. Resolve ancestor chain left-to-right per `extends` order
2. Child sections with same name as ancestor → **override**
3. Child sections with new name → **append** after ancestor's ordered sections
4. Empty body → **remove** inherited section
5. Same section name across multiple ancestors → **last defined wins**
   (right-to-left in `extends` array)

### Frontmatter Merging

- All frontmatter keys shallow-merged up the chain
- Child values override parent values per key
- `extends: [...]` stripped from output (build metadata only)
- OpenCode-specific keys handled: `name`, `description`, `mode`, `model`,
  `permission`, `temperature`, `topP`, `color`

### Safety Limits

- **Inheritance depth limit:** configurable via `maxInheritDepth` (default: 5)
- **Circular dependency detection:** tracks visited module names; on cycle,
  reports the full chain: `Circular inheritance: a → b → c → a`

### Dependency Resolution Order

Batch resolution uses topological sort on the inheritance DAG. Leaf agents
resolve first, dependent agents resolve in topological order. Cycles detected
early before any resolution begins.

## Data Model

### Prompt Record (JSONL)

```typescript
interface PromptRecord {
  id: string;               // {project}-{4hex}
  name: string;             // module path, e.g. "system/base"
  version: number;          // auto-incremented on import
  sections: Section[];      // parsed from ## headings
  extends?: string[];       // module paths (left-to-right merge order)
  frontmatter: Record<string, unknown>;
  status: "draft" | "active";
  createdAt: string;
  updatedAt: string;
}

interface Section {
  name: string;             // lowercased heading, e.g. "role"
  body: string;             // markdown content under heading
}
```

## Tech Stack

- **Runtime:** Bun (TypeScript)
- **Dependencies:** minimal (YAML parsing, CLI arg handling)
- **Format:** JSONL for store (diffable, mergeable)

## Attribution

Composition engine logic in `src/resolve.ts` is adapted from
[jayminwest/canopy](https://github.com/jayminwest/canopy) (`src/render.ts`),
released under the MIT License. File header comment and project LICENSE include
full attribution. Original copyright: © 2026 Canopy contributors.
