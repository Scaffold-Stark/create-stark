import path from "path";
import fs from "fs";
import { execa } from "execa";
import { findExtensionByFlag } from "../utils/load-extensions";
import type { Extension } from "../types";

export async function copyExtensionFile(extensionName: string, targetDirectory: string) {

  if (!extensionName || extensionName.trim() === "") {
    return;
  }

  const extensionConfig = findExtensionByFlag(extensionName);

  if (!extensionConfig) {
    return;
  }

  const targetPackagesDir = path.join(targetDirectory, "packages");
  
  if (!fs.existsSync(targetPackagesDir)) {
    return;
  }

  try {
    const tempDir = path.join(targetDirectory, ".temp-extension");
    fs.mkdirSync(tempDir, { recursive: true });

    await cloneExtensionRepository(extensionConfig, tempDir);

    await copyExtensionFiles(tempDir, targetPackagesDir, extensionConfig.extensionFlagValue);

    await mergePackageJsonFiles(tempDir, targetPackagesDir, extensionConfig.extensionFlagValue);

    await mergeRootPackageJson(tempDir, targetDirectory, extensionConfig.extensionFlagValue);

    fs.rmSync(tempDir, { recursive: true, force: true });

  } catch (error) {
    throw error;
  }
}

async function cloneExtensionRepository(extension: Extension, tempDir: string) {
  try {
    const { stdout, stderr } = await execa("git", [
      "clone",
      "--branch", extension.branch,
      "--single-branch",
      "--depth", "1",
      extension.repository,
      tempDir
    ]);

  } catch (error) {
    throw error;
  }
}

async function copyExtensionFiles(tempDir: string, targetPackagesDir: string, extensionName: string) {
  let extensionPackageDir = path.join(tempDir, "packages", extensionName);
  
  if (!fs.existsSync(extensionPackageDir)) {
    extensionPackageDir = path.join(tempDir, "extensions", "packages", extensionName);
  }
  
  if (fs.existsSync(extensionPackageDir)) {
    const targetExtensionDir = path.join(targetPackagesDir, extensionName);
    copyDirectoryRecursive(extensionPackageDir, targetExtensionDir);
  }
  
  let extensionPackagesDir = path.join(tempDir, "packages");
  
  if (!fs.existsSync(extensionPackagesDir)) {
    extensionPackagesDir = path.join(tempDir, "extensions", "packages");
  }
  
  if (fs.existsSync(extensionPackagesDir)) {
    const packages = fs.readdirSync(extensionPackagesDir);
    
    for (const packageName of packages) {
      if (packageName === extensionName) {
        continue;
      }
      
      const sourcePackageDir = path.join(extensionPackagesDir, packageName);
      const targetPackageDir = path.join(targetPackagesDir, packageName);
      
      if (fs.existsSync(targetPackageDir)) {
        mergeDirectoryRecursive(sourcePackageDir, targetPackageDir);
      } else {
        copyDirectoryRecursive(sourcePackageDir, targetPackageDir);
      }
    }
  }
}

async function mergePackageJsonFiles(tempDir: string, targetPackagesDir: string, extensionName: string) {
  let extensionPackagesDir = path.join(tempDir, "packages");
  
  if (!fs.existsSync(extensionPackagesDir)) {
    extensionPackagesDir = path.join(tempDir, "extensions", "packages");
  }
  
  if (!fs.existsSync(extensionPackagesDir)) {
    return;
  }
  
  const packages = fs.readdirSync(extensionPackagesDir);
  
  for (const packageName of packages) {
    const sourcePackageDir = path.join(extensionPackagesDir, packageName);
    const targetPackageDir = path.join(targetPackagesDir, packageName);
    
    if (fs.existsSync(targetPackageDir)) {
      const sourcePackageJsonPath = path.join(sourcePackageDir, "package.json");
      const targetPackageJsonPath = path.join(targetPackageDir, "package.json");
      
      if (fs.existsSync(sourcePackageJsonPath) && fs.existsSync(targetPackageJsonPath)) {
        mergePackageJson(sourcePackageJsonPath, targetPackageJsonPath);
      }
    }
  }
}

async function mergeRootPackageJson(tempDir: string, targetDirectory: string, extensionName: string) {
  let extensionRootPackageJsonPath = path.join(tempDir, "package.json");
  
  if (!fs.existsSync(extensionRootPackageJsonPath)) {
    extensionRootPackageJsonPath = path.join(tempDir, "extensions", "package.json");
  }
  
  if (!fs.existsSync(extensionRootPackageJsonPath)) {
    return;
  }
  
  const targetRootPackageJsonPath = path.join(targetDirectory, "package.json");
  
  if (fs.existsSync(targetRootPackageJsonPath)) {
    mergePackageJson(extensionRootPackageJsonPath, targetRootPackageJsonPath);
    addPackageToWorkspaces(targetRootPackageJsonPath, extensionName);
  }
}

function mergePackageJson(sourcePath: string, targetPath: string) {
  try {
    const sourcePackageJson = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const targetPackageJson = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    
    if (sourcePackageJson.scripts && targetPackageJson.scripts) {
      targetPackageJson.scripts = { ...targetPackageJson.scripts, ...sourcePackageJson.scripts };
    }
    
    if (sourcePackageJson.dependencies && targetPackageJson.dependencies) {
      targetPackageJson.dependencies = { ...targetPackageJson.dependencies, ...sourcePackageJson.dependencies };
    }
    
    if (sourcePackageJson.devDependencies && targetPackageJson.devDependencies) {
      targetPackageJson.devDependencies = { ...targetPackageJson.devDependencies, ...sourcePackageJson.devDependencies };
    }
    
    if (sourcePackageJson.peerDependencies && targetPackageJson.peerDependencies) {
      targetPackageJson.peerDependencies = { ...targetPackageJson.peerDependencies, ...sourcePackageJson.peerDependencies };
    }
    
    fs.writeFileSync(targetPath, JSON.stringify(targetPackageJson, null, 2));
    
  } catch (error) {
    // Error handling without logging
  }
}

function addPackageToWorkspaces(packageJsonPath: string, packageName: string) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    if (packageJson.workspaces && packageJson.workspaces.packages) {
      const workspacePath = `packages/${packageName}`;
      if (!packageJson.workspaces.packages.includes(workspacePath)) {
        packageJson.workspaces.packages.push(workspacePath);
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      }
    }
  } catch (error) {
    // Error handling without logging
  }
}

function copyDirectoryRecursive(source: string, destination: string) {
  fs.mkdirSync(destination, { recursive: true });
  
  const files = fs.readdirSync(source);
  
  for (const file of files) {
    const sourcePath = path.join(source, file);
    const destPath = path.join(destination, file);
    
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      copyDirectoryRecursive(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

function mergeDirectoryRecursive(source: string, destination: string) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }
  
  const files = fs.readdirSync(source);
  
  for (const file of files) {
    const sourcePath = path.join(source, file);
    const destPath = path.join(destination, file);
    
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      mergeDirectoryRecursive(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}