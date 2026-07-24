import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { loadConfig, emitAll } from "md-merger";
import type { Config } from "md-merger";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Defaults are bundled in the plugin package via prepublishOnly (copies ../../defaults/ to ./defaults/)
const defaultsDir = join(__dirname, "..", "defaults", "agents");

async function loadBundledDefaults(): Promise<Map<string, string>> {
  const defaults = new Map<string, string>();
  if (!existsSync(defaultsDir)) return defaults;
  // Read each .md file in defaults/agents/
  const entries = await readdir(defaultsDir);
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const agentName = entry.slice(0, -3); // strip .md
    try {
      const content = await readFile(join(defaultsDir, entry), "utf-8");
      defaults.set(agentName, content);
    } catch {
      console.warn(`[md-merger] Failed to read bundled default: ${entry}`);
    }
  }
  return defaults;
}

export const mdMergerPlugin: Plugin = async (_input: PluginInput) => {
  try {
    const bundledDefaults = await loadBundledDefaults();
    // NOTE: If OpenCode provides input.directory, chdir to it before calling
    // loadConfig()/emitAll() so config resolution uses the correct working context:
    // if (input.directory) process.chdir(input.directory);
    const config = await loadConfig();
    // TODO: dryRun is hard-coded to false (plugin should always emit).
    // Could be made configurable via plugin settings or input config later.
    const writtenPaths = await emitAll(config.storeFile, config.emitDirs, config, false);

    if (writtenPaths.length === 0 && bundledDefaults.size > 0) {
      console.log("[md-merger] No config found — bundled defaults available from defaults/agents/");
    }

    const agentHooks = {
      config: async (opencodeConfig: Record<string, unknown>) => {
        if (writtenPaths.length === 0) {
          console.log("[md-merger] No emitted agents found, using bundled defaults");
          // Inject bundled defaults directly into OpenCode config
          if (opencodeConfig.agent === undefined) {
            opencodeConfig.agent = {};
          }
          const agentConfig = opencodeConfig.agent as Record<string, unknown>;
          for (const [name, content] of bundledDefaults) {
            agentConfig[name] = { prompt: content };
          }
        }
      },
    };

    return agentHooks;
  } catch (err) {
    console.error("[md-merger] Plugin initialization failed:", err);
    return {};
  }
};
