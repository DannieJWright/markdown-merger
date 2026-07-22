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

/**
 * Split a markdown body section into an array of Section objects by `##` headings.
 *
 * Only `##` (exactly two `#`) headings are recognised — lines starting with
 * `###` or more `#` characters stay as regular text inside the current section.
 */
export function parseSections(body: string): Section[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let introLines: string[] = [];
  let currentSection: { name: string; lines: string[] } | null = null;

  const headingRegex = /^##\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(headingRegex);
    if (match) {
      // Flush previous section
      if (currentSection) {
        sections.push({
          name: currentSection.name,
          body: currentSection.lines.join("\n").trim(),
        });
      }
      // Flush intro
      if (introLines.length > 0) {
        sections.push({
          name: "intro",
          body: introLines.join("\n").trim(),
        });
        introLines = [];
      }
      // Start new section
      currentSection = {
        name: match[1]!.toLowerCase().replace(/\s+/g, "-"),
        lines: [],
      };
    } else {
      if (currentSection) {
        currentSection.lines.push(line);
      } else {
        introLines.push(line);
      }
    }
  }

  // Flush last section
  if (currentSection) {
    sections.push({
      name: currentSection.name,
      body: currentSection.lines.join("\n").trim(),
    });
  }

  // Flush remaining intro
  if (introLines.length > 0) {
    sections.push({
      name: "intro",
      body: introLines.join("\n").trim(),
    });
  }

  return sections;
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
    (k) => k !== "extends" && k !== "abstract",
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

  // Emit each section
  for (const section of sections) {
    const displayName = section.name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    result += `## ${displayName}\n\n${section.body}\n`;
  }

  return result;
}
