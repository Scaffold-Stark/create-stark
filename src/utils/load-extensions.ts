import fs from "fs";
import path from "path";
import type { Extension } from "../types";

export function loadExtensions(): Extension[] {
  try {
    const extensionsPath = path.join(process.cwd(), "src", "extensions.json");
    const extensionsData = fs.readFileSync(extensionsPath, "utf8");
    return JSON.parse(extensionsData);
  } catch (error) {
    console.error("Failed to load extensions:", error);
    return [];
  }
}

export function findExtensionByFlag(flagValue: string): Extension | undefined {
  const extensions = loadExtensions();
  return extensions.find(ext => ext.extensionFlagValue === flagValue);
} 