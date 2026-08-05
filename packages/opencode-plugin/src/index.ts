import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { loadConfig, build, emitAll } from "@md-merger/cli";
import type { Config } from "@md-merger/cli";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Defaults are bundled in the plugin package via prepublishOnly (copies ../cli/defaults/ to ./defaults/)
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
    if (_input.directory) process.chdir(_input.directory);
    const config = await loadConfig();
    await build(config.rootDirs, config.storeFile, config.project);
    const writtenPaths = await emitAll(config.storeFile, config.emitDirs, config, false);

    if (writtenPaths.length === 0 && bundledDefaults.size > 0) {
      console.log("[md-merger] No config found — bundled defaults available from defaults/agents/");
    }

    const agentHooks = {
      config: async (opencodeConfig: Record<string, unknown>) => {
        if (writtenPaths.length > 0) {
          // Read emitted agent files and inject into OpenCode config
          if (opencodeConfig.agent === undefined) {
            opencodeConfig.agent = {};
          }
          const agentConfig = opencodeConfig.agent as Record<string, unknown>;
          for (const path of writtenPaths) {
            try {
              const content = await readFile(path, "utf-8");
              const agentName = path.replace(/\.md$/, "").replace(/.*[/\\]/, "");
              agentConfig[agentName] = { prompt: content };
            } catch {
              console.warn(`[md-merger] Failed to read emitted agent: ${path}`);
            }
          }
        } else {
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
