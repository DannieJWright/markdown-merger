import { Section } from "./types";

/**
 * Extract frontmatter YAML block and markdown body from a string.
 *
 * If content doesn't start with `---\n`, returns empty metadata and the
 * original content as body.
 */
export function extractFrontmatter(
  content: string,
): { metadata: Record<string, unknown>; body: string } {
  if (!content.startsWith("---\n")) {
    return { metadata: {}, body: content };
  }

  const afterFirst = content.indexOf("\n---\n", 4);
  if (afterFirst === -1) {
    return { metadata: {}, body: content };
  }

  const yamlBlock = content.slice(4, afterFirst);
  const body = content.slice(afterFirst + 5); // skip "\n---\n"

  const metadata: Record<string, unknown> = {};
  let currentKey: string | null = null;

  const lines = yamlBlock.split("\n");
  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === "") continue;
    // Skip comments
    if (line.trim().startsWith("#")) continue;

    // Check for indented list item (continuation of previous key)
    const listMatch = line.match(/^(\s+)-\s+(.+)$/);
    if (listMatch && currentKey !== null) {
      const arr = metadata[currentKey];
      if (Array.isArray(arr)) {
        arr.push(listMatch[2]!.trim());
      }
      continue;
    }

    // Split on first colon for key/value
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    currentKey = key;

    // Parse inline array [..., ...]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      if (inner.trim() === "") {
        metadata[key] = [];
      } else {
        metadata[key] = inner.split(",").map((s) => s.trim());
      }
      continue;
    }

    // Coerce booleans
    if (value === "true") {
      metadata[key] = true;
      continue;
    }
    if (value === "false") {
      metadata[key] = false;
      continue;
    }

    // Coerce integers
    if (/^-?\d+$/.test(value)) {
      metadata[key] = Number(value);
      continue;
    }

    // Plain string — if a subsequent indented list follows, initialise as array
    if (value === "") {
      metadata[key] = [];
    } else {
      metadata[key] = value;
    }
  }

  return { metadata, body };
}

const fenceRegex = /^(```|~~~)/;
const headingRegex = /^#{2,6}\s+(.+)$/;
const headingLevelRegex = /^#+/;

function headingName(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Parse child sections from lines[start..end-1] whose parent is at parentLevel.
 * Returns sections parsed at this level and the index past the last consumed line.
 */
function parseChildren(
  lines: string[],
  fenceState: boolean[],
  start: number,
  end: number,
  parentLevel: number,
): { sections: Section[]; nextLine: number } {
  const sections: Section[] = [];
  let line = start;

  while (line < end) {
    if (fenceState[line]) {
      line++;
      continue;
    }

    if (!lines[line]!.match(headingRegex)) {
      // No more headings ahead — stop so parent collects trailing body
      let hasHeadingAhead = false;
      for (let k = line + 1; k < end; k++) {
        if (fenceState[k]) continue;
        if (lines[k]!.match(headingRegex)) { hasHeadingAhead = true; break; }
      }
      if (!hasHeadingAhead) break;
      line++;
      continue;
    }

    const headerLine = lines[line]!;
    const match = headerLine.match(headingRegex);
    if (!match) { line++; continue; }

    const level = (headerLine.match(headingLevelRegex)![0]!.length) - 1;
    if (level <= parentLevel) break;

    const section: Section = {
      name: headingName(match[1]!),
      body: "",
      level,
    };

    // Look ahead for first child heading or sibling heading
    let bodyEnd = end;
    let childIdx = -1;
    let foundHeading = false;

    for (let j = line + 1; j < end; j++) {
      if (fenceState[j]) continue;
      if (!lines[j]!.match(headingRegex)) continue;
      foundHeading = true;
      const jl = (lines[j]!.match(headingLevelRegex)![0]!.length) - 1;
      bodyEnd = j;
      if (jl > level) childIdx = j;
      break;
    }

    // If no heading found ahead, find the first non-empty line to capture body
    // so the parent can collect remaining lines as trailing body
    if (!foundHeading) {
      let firstBodyLine = line + 1;
      while (firstBodyLine < end && (!lines[firstBodyLine] || lines[firstBodyLine]!.trim() === "")) {
        firstBodyLine++;
      }
      bodyEnd = Math.min(firstBodyLine + 1, end);
    }

    section.body = lines.slice(line + 1, bodyEnd).join("\n").trim();

    if (childIdx > 0) {
      const { sections: children, nextLine: nl } = parseChildren(lines, fenceState, childIdx, end, level);
      section.children = children;
      line = nl;

      // Collect trailing body after children (lines after last child but before next sibling)
      const trailing: string[] = [];
      while (line < end) {
        if (fenceState[line]) { line++; continue; }
        const tm = lines[line]!.match(headingRegex);
        if (tm) {
          const tl = (lines[line]!.match(headingLevelRegex)![0]!.length) - 1;
          if (tl <= level) break;
          // Heading at deeper level — it's another child we haven't parsed yet
          break;
        }
        trailing.push(lines[line]!);
        line++;
      }
      if (trailing.length > 0) {
        section.body += "\n\n" + trailing.join("\n").trim();
      }
    } else {
      // No children — advance past the section's body
      line = bodyEnd;
    }

    sections.push(section);
  }

  return { sections, nextLine: line };
}

export function parseSections(body: string): Section[] {
  if (!body.trim()) return [];

  const lines = body.split("\n");

  // Pre-compute fence state for the entire document
  const fenceState: boolean[] = new Array(lines.length);
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.match(fenceRegex)) fence = !fence;
    fenceState[i] = fence;
  }

  // Phase 1: collect intro (text before first heading)
  let line = 0;
  while (line < lines.length) {
    if (fenceState[line]) { line++; continue; }
    if (lines[line]!.match(headingRegex)) break;
    line++;
  }

  const sections: Section[] = [];
  if (line > 0) {
    sections.push({
      name: "intro",
      body: lines.slice(0, line).join("\n").trim(),
      level: 0,
    });
  }

  // Phase 2: parse hierarchical tree
  const { sections: bodySections } = parseChildren(lines, fenceState, line, lines.length, 0);
  return [...sections, ...bodySections];
}

/**
 * Convert a kebab-case section name to PascalCase (Title Case).
 * Example: "quality-gates" → "Quality Gates", "role" → "Role"
 */
export function sectionNameToPascalCase(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function renderSection(section: Section): string {
  const level = section.level ?? 1;
  const hashes = "#".repeat(level + 1);
  const displayName = sectionNameToPascalCase(section.name);

  let result = `${hashes} ${displayName}`;
  if (section.body) result += "\n\n" + section.body;
  if (section.children?.length) {
    for (const child of section.children) result += "\n\n" + renderSection(child);
  }
  return result;
}

/**
 * Render frontmatter metadata and sections back to a markdown string.
 */
export function renderMarkdown(
  frontmatter: Record<string, unknown>,
  sections: Section[],
): string {
  let result = "";

  // Emit frontmatter block if there are keys (excluding extends/abstract)
  const relevantKeys = Object.keys(frontmatter).filter(
    (k) => k !== "extends" && k !== "abstract" && k !== "type",
  );
  if (relevantKeys.length > 0) {
    result += "---\n";
    for (const key of relevantKeys) {
      const val = frontmatter[key];
      if (Array.isArray(val)) {
        result += `${key}: [${val.join(", ")}]\n`;
      } else if (typeof val === "boolean") {
        result += `${key}: ${val ? "true" : "false"}\n`;
      } else {
        result += `${key}: ${val}\n`;
      }
    }
    result += "---\n\n";
  }

  const sectionTexts = sections.map(renderSection);
  if (sectionTexts.length > 0) {
    result += sectionTexts.join("\n\n") + "\n";
  }
  return result;
}
