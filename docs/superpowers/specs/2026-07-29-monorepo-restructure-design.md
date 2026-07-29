# Monorepo Structure Restructure for Bun Workspace Compatibility

## Date
2026-07-29

## Problem

Bun does not support the root package being a resolvable workspace member by other workspace packages. Running `bun install` fails with:
```
error: Workspace dependency "@md-merger/cli" not found
Searched in ".\*"
```

This is a known Bun limitation (issues [#5176](https://github.com/oven-sh/bun/issues/5176), [#2773](https://github.com/oven-sh/bun/issues/2773)). The workspace discovery system scans subdirectories — the root directory itself is never registered as a linkable workspace package.

## Goal

Restructure the repository so `@md-merger/cli` and `@md-merger/opencode-plugin` are both proper workspace members under `packages/`, with a private root container. This enables `bun install` to work correctly and unblocks npm OIDC trusted publishing migration.

## Current Structure

```
evo-ai/
├── package.json          (@md-merger/cli — publishable root)
├── bunfig.toml
├── tsconfig.json
├── Justfile
├── defaults/
│   ├── agents/
│   └── skills/
├── src/                  (CLI source + api.ts)
├── tests/                (all tests at root)
│   ├── unit/
│   ├── e2e/
│   └── resources/
├── opencode-plugin/      (depends on @md-merger/cli via workspace:*)
│   ├── package.json
│   └── src/
└── .github/workflows/
```

## Target Structure

```
evo-ai/
├── package.json            (private: true, workspaces: ["packages/*"])
├── bunfig.toml             (unchanged)
├── tsconfig.json           (updated paths)
├── Justfile                (updated paths)
├── defaults/               (shared — stays at root, plugin copies at publish time)
│   ├── agents/
│   └── skills/
├── packages/
│   ├── cli/
│   │   ├── package.json    (@md-merger/cli — moved from root)
│   │   ├── src/            (all CLI source including api.ts)
│   │   └── tests/          (api.test.ts, config.test.ts, e2e.test.ts, resources/)
│   └── opencode-plugin/
│       ├── package.json    (depends on @md-merger/cli via workspace:*)
│       ├── src/
│       └── tests/          (plugin.test.ts — validates plugin API surface)
└── .github/workflows/
```

## Detailed Changes

### 1. Root `package.json` — Become Private Container

Becomes a workspace container with `private: true`. Removes all CLI-specific configuration (name, bin, exports, scripts, etc.) which moves to `packages/cli/package.json`.

```json
{
  "name": "@md-merger/monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "devDependencies": {
    "@types/node": "^26.1.1",
    "bun-types": "^1.3.14",
    "typescript": "^7.0.2"
  }
}
```

### 2. New `packages/cli/package.json`

Contains all current root `package.json` publishable config (name, version, bin, exports, scripts, etc.) plus the CLI-specific `publishConfig` and `files` fields.

### 3. `packages/opencode-plugin/package.json`

No content changes. The `workspace:*` reference to `@md-merger/cli` will now resolve correctly since both are proper workspace members.

### 4. Source Files — Move to `packages/cli/src/`

All files from root `src/` → `packages/cli/src/`:
- `api.ts`, `cli.ts`, `config.ts`, `emit.ts`, `frontmatter.ts`, `import.ts`, `index.ts`, `resolve.ts`, `store.ts`, `types.ts`

### 5. Tests — Split by Package

**All CLI-related tests → `packages/cli/tests/`:**

| Test | Destination | Reason |
|------|------------|--------|
| `tests/unit/api.test.ts` | `packages/cli/tests/unit/api.test.ts` | Tests CLI API |
| `tests/unit/cli.test.ts` | `packages/cli/tests/unit/cli.test.ts` | Tests CLI module |
| `tests/unit/config.test.ts` | `packages/cli/tests/unit/config.test.ts` | Tests CLI config |
| `tests/unit/emit.test.ts` | `packages/cli/tests/unit/emit.test.ts` | Tests emit module |
| `tests/unit/frontmatter.test.ts` | `packages/cli/tests/unit/frontmatter.test.ts` | Tests frontmatter module |
| `tests/unit/import.test.ts` | `packages/cli/tests/unit/import.test.ts` | Tests import module |
| `tests/unit/resolve.test.ts` | `packages/cli/tests/unit/resolve.test.ts` | Tests resolve module |
| `tests/unit/store.test.ts` | `packages/cli/tests/unit/store.test.ts` | Tests store module |
| `tests/e2e/e2e.test.ts` | `packages/cli/tests/e2e/e2e.test.ts` | Tests CLI e2e |
| `tests/resources/` | `packages/cli/tests/resources/` | Shared test fixtures |

**Plugin tests → `packages/opencode-plugin/tests/`:**

| Test | Destination | Reason |
|------|------------|--------|
| `tests/unit/plugin.test.ts` | `packages/opencode-plugin/tests/plugin.test.ts` | Tests plugin surface |

**Build output stays excluded:**
- `tests/build/` remains at repo root in `.gitignore`, excluded from both packages and typecheck

### 6. `tsconfig.json` — Updated Paths

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "types": ["node", "bun-types"],
    "paths": {
      "@md-merger/*": ["./packages/cli/src/*"],
      "@md-merger/cli": ["./packages/cli/src/api.ts"]
    }
  },
  "include": ["packages/cli/src/**/*.ts", "packages/cli/tests/**/*.ts", "packages/opencode-plugin/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 7. `Justfile` — Updated Paths

```justfile
build:
    bun ./packages/cli/src/index.ts build

emit *args:
    bun ./packages/cli/src/index.ts emit {{args}}

render args:
    bun ./packages/cli/src/index.ts render {{args}}

doctor:
    bun ./packages/cli/src/index.ts doctor

stats:
    bun ./packages/cli/src/index.ts stats

test:
    bun test

typecheck:
    bun run typecheck
```

### 8. Test Import Paths — Updated

| File | Old Import | New Import |
|------|-----------|------------|
| `packages/cli/tests/unit/api.test.ts` | `"../../src/api"` | `"../src/api"` |
| `packages/cli/tests/e2e/e2e.test.ts` | `"../../src/cli"` | `"../src/cli"` |
| `packages/cli/tests/e2e/e2e.test.ts` | `"../../src/config"` | `"../src/config"` |
| `packages/opencode-plugin/tests/plugin.test.ts` | `"../../opencode-plugin/src/index"` | `"../src/index"` |

### 9. GitHub Actions — Phase 2 (CI Updates)

#### `md-merger-publish.yml`
Add `working-directory: packages/cli` to bun install, bundle, and npm publish steps.

#### `opencode-plugin-publish.yml`
Change `working-directory: opencode-plugin` → `working-directory: packages/opencode-plugin`.

### 10. `defaults/` — Shared Asset

Remains at repo root. The plugin's `prepublishOnly` script already copies `../defaults` → `./defaults` at publish time, which continues to work since relative path adjusts to `../../defaults`.

## Migration Plan

### Phase 1: Workspace Restructure
1. Create `packages/cli/` directory hierarchy
2. Move `src/` → `packages/cli/src/`
3. Move `tests/` → `packages/cli/tests/`, move `plugin.test.ts` → `packages/opencode-plugin/tests/`
4. Move `opencode-plugin/` → `packages/opencode-plugin/`
5. Create new `packages/cli/package.json` with CLI config
6. Update root `package.json` to private container
7. Update `tsconfig.json`, `Justfile`, test import paths
8. Update plugin `prepublishOnly` script path
9. **Verification**: Run `bun install`, `bun run bundle`, `bun test`, `bun run typecheck`

### Phase 2: CI Workflow Updates
10. Update `md-merger-publish.yml` with `working-directory: packages/cli`
11. Update `opencode-plugin-publish.yml` with adjusted paths
12. **Verification**: Manual publish test or dry-run validation

## Success Criteria

- [ ] `bun install` succeeds without workspace resolution errors
- [ ] `bun run bundle` produces correct `packages/cli/dist/index.js`
- [ ] All tests pass under `packages/cli/tests/`
- [ ] Plugin test passes under `packages/opencode-plugin/tests/`
- [ ] `bun run typecheck` passes
- [ ] CI workflows reference correct `working-directory` paths
- [ ] npm OIDC trusted publishing can be configured (prerequisite for previous work)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Test imports break | Tests fail | Update all import paths; run full test suite after restructure |
| `Justfile` commands break | Dev workflow fails | Verify each command after path updates |
| Plugin `prepublishOnly` path | Publish fails | Update relative path from `../defaults` to `../../defaults` |
| CI workflow failures | Deploy blocked | Phase 2 updates workflows; test locally before pushing tags |
| Git history disruption | Hard to find old files | Use `git mv` for all moves to preserve history |
