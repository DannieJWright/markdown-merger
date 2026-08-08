import { readFile } from "node:fs/promises";
import { join, posix, win32 } from "node:path";

export const ROOT_CONFIG_FILENAME = "md-merger-root.yaml";

function normalizeTarget(target: string): string {
  return target.trim().replace(/\\/g, "/").replace(/\.md$/, "");
}

function fail(message: string, path: string): never {
  throw new Error(`${message} in ${path}`);
}

function assertBareAlias(alias: string, path: string): void {
  if (!alias || alias.includes("/") || alias.includes("\\")) fail(`Invalid bare export alias "${alias}"`, path);
}

function assertRelativeTarget(target: string, path: string): void {
  const normalized = target.replace(/\\/g, "/");
  if (posix.isAbsolute(normalized) || win32.isAbsolute(target) || normalized.split("/").some((s) => s === "." || s === "..")) {
    fail(`Export target "${target}" must be a relative module path without dot segments`, path);
  }
}

export async function loadRootExports(rootDir: string, moduleNames: ReadonlySet<string>): Promise<Map<string, string>> {
  const manifestPath = join(rootDir, ROOT_CONFIG_FILENAME);
  let text: string;
  try { text = await readFile(manifestPath, "utf-8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map(); throw error; }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let seenExports = false;
  const result = new Map<string, string>();
  let inExports = false;
  for (const raw of lines) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    if (raw === "exports:") {
      if (seenExports) fail("Duplicate top-level exports", manifestPath);
      seenExports = true; inExports = true; continue;
    }
    if (!seenExports) fail("Expected top-level exports mapping", manifestPath);
    if (!raw.startsWith("  ") || /\s/.test(raw[2] ?? "")) fail("Invalid indentation or top-level content", manifestPath);
    const entry = raw.slice(2);
    const match = /^([^:]+): ([^\s].*)$/.exec(entry);
    if (!match) fail("Expected a mapping entry", manifestPath);
    const alias = match[1]!.trim(); const target = match[2]!.trim();
    if (!alias || !target || /\s+#/.test(alias) || /\s+#/.test(target) || /^["']|["']$/.test(alias) || /^["']|["']$/.test(target) || target.startsWith("{") || target.startsWith("[")) fail(`Invalid export entry "${entry}"`, manifestPath);
    assertBareAlias(alias, manifestPath); assertRelativeTarget(target, manifestPath);
    const canonical = normalizeTarget(target);
    if (result.has(alias)) fail(`Duplicate export alias "${alias}"`, manifestPath);
    if (!moduleNames.has(canonical)) fail(`Export target "${canonical}" is not a module in this root`, manifestPath);
    result.set(alias, canonical);
  }
  if (!seenExports) fail("Missing exports mapping", manifestPath);
  return result;
}
