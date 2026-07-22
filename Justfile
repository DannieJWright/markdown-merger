# Justfile for evo-ai — agent prompt management with inheritance
#
# Setup:
#   1. Create .evo/config.yaml with your project config
#   2. Create .md agent files in your rootDirs
#   3. Run: just build          # import agents into store
#   4. Run: just emit           # generate merged output files
#
# Inheritance:
#   Agent .md files can extend other agents via frontmatter:
#     ---
#     extends: [system-base, traits/caution]
#     abstract: false
#     ---
#   Child sections override parent sections by name.
#   Empty body removes a section. New sections are appended.
#   Use `just render <name>` to preview merged output.
#   Use `just doctor` to validate references and detect cycles.

default:
	@just --list

# Import agent .md files from rootDirs into the JSONL store
build:
	bun ./src/index.ts build

# Emit merged agent .md files (--dry-run to preview)
emit *args:
	bun ./src/index.ts emit {{args}}

# Render and print a single agent with inheritance resolved
render args:
	bun ./src/index.ts render {{args}}

# Validate references and detect circular dependencies
doctor:
	bun ./src/index.ts doctor

# Show agent counts: total, abstract, and leaf agents
stats:
	bun ./src/index.ts stats

# Run all tests
test:
	bun test

# Type-check without emitting files
typecheck:
	bun run typecheck
