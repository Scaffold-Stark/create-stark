import type { Extension } from "../types";
import extensions from "../extensions.json";

export function loadExtensions(): Extension[] {
  return extensions as Extension[];
}

export function findExtensionByFlag(flagValue: string): Extension | undefined {
  return extensions.find((ext: Extension) => ext.extensionFlagValue === flagValue);
} 