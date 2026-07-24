# Justfile for md-merger — markdown file processing with inheritance
#
# Setup:
#   1. Create .md-merger/config.yaml with your project config
#   2. Create .md files with type and extends in frontmatter
#   3. Run: just build          # import modules into store
#   4. Run: just emit           # generate merged output files
#
# Inheritance:
#   Module .md files can extend other modules via frontmatter:
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

# Import .md files from rootDirs into the JSONL store
build:
	bun ./src/index.ts build

# Emit merged .md files (--dry-run to preview)
emit *args:
	bun ./src/index.ts emit {{args}}

# Render and print a single module with inheritance resolved
render args:
	bun ./src/index.ts render {{args}}

# Validate references and detect circular dependencies
doctor:
	bun ./src/index.ts doctor

# Show module counts: total, abstract, and leaf modules
stats:
	bun ./src/index.ts stats

# Run all tests
test:
	bun test

# Type-check without emitting files
typecheck:
	bun run typecheck
