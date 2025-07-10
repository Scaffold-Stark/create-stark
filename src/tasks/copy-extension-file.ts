import path from "path";
import fs from "fs";
import chalk from "chalk";
import { execa } from "execa";
import { findExtensionByFlag } from "../utils/load-extensions";
import type { Extension } from "../types";

const prettyLog = {
  info: (message: string, indent = 0) => console.log(chalk.cyan(`${"  ".repeat(indent)}${message}`)),
  success: (message: string, indent = 0) => console.log(chalk.green(`${"  ".repeat(indent)}✔︎ ${message}`)),
  warning: (message: string, indent = 0) => console.log(chalk.yellow(`${"  ".repeat(indent)}⚠ ${message}`)),
  error: (message: string, indent = 0) => console.log(chalk.red(`${"  ".repeat(indent)}✖ ${message}`)),
};

export async function copyExtensionFile(extensionName: string, targetDirectory: string) {

  if (!extensionName || extensionName.trim() === "") {
    prettyLog.info("No extension specified, skipping extension installation");
    return;
  }

  // Find the extension configuration
  const extensionConfig = findExtensionByFlag(extensionName);

  if (!extensionConfig) {
    prettyLog.error(`Extension '${extensionName}' not found in extensions.json`);
    return;
  }



  prettyLog.info(`Installing extension: ${extensionName}`);
  prettyLog.info(`Description: ${extensionConfig.description}`);
  prettyLog.info(`Repository: ${extensionConfig.repository}`);
  prettyLog.info(`Branch: ${extensionConfig.branch}`);

  // Path to the packages directory in the target project
  const targetPackagesDir = path.join(targetDirectory, "packages");
  
  // Check if the target packages directory exists
  if (!fs.existsSync(targetPackagesDir)) {
    prettyLog.error(`Target packages directory not found: ${targetPackagesDir}`);
    return;
  }

  try {
    // Create a temporary directory for cloning
    const tempDir = path.join(targetDirectory, ".temp-extension");
    fs.mkdirSync(tempDir, { recursive: true });

    // Clone the extension repository
    prettyLog.info("Cloning extension repository...");
    await cloneExtensionRepository(extensionConfig, tempDir);

    // Copy extension files to the target project
    await copyExtensionFiles(tempDir, targetPackagesDir, extensionConfig.extensionFlagValue);

    // Merge package.json files
    await mergePackageJsonFiles(tempDir, targetPackagesDir, extensionConfig.extensionFlagValue);

    // Merge root package.json with extension scripts
    await mergeRootPackageJson(tempDir, targetDirectory, extensionConfig.extensionFlagValue);

    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    prettyLog.success(`Successfully installed extension '${extensionConfig.extensionFlagValue}' into ${targetPackagesDir}`);
  } catch (error) {
    prettyLog.error(`Failed to install extension: ${error}`);
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

    if (stderr && !stderr.includes("Cloning into")) {
      prettyLog.warning(`Git clone warnings: ${stderr}`);
    }

    prettyLog.success("Repository cloned successfully");
  } catch (error) {
    prettyLog.error(`Failed to clone repository: ${error}`);
    throw error;
  }
}

async function copyExtensionFiles(tempDir: string, targetPackagesDir: string, extensionName: string) {
  // Copy the extension package if it exists
  // First try the expected structure: tempDir/packages/extensionName
  let extensionPackageDir = path.join(tempDir, "packages", extensionName);
  
  // If not found, try the actual structure: tempDir/extensions/packages/extensionName
  if (!fs.existsSync(extensionPackageDir)) {
    extensionPackageDir = path.join(tempDir, "extensions", "packages", extensionName);
  }
  
  if (fs.existsSync(extensionPackageDir)) {
    const targetExtensionDir = path.join(targetPackagesDir, extensionName);
    copyDirectoryRecursive(extensionPackageDir, targetExtensionDir);
    prettyLog.info(`Copied extension package: ${extensionName}`);
  }
  
  // Copy any extension files that should be merged into existing packages
  // First try the expected structure: tempDir/packages
  let extensionPackagesDir = path.join(tempDir, "packages");
  
  // If not found, try the actual structure: tempDir/extensions/packages
  if (!fs.existsSync(extensionPackagesDir)) {
    extensionPackagesDir = path.join(tempDir, "extensions", "packages");
  }
  
  if (fs.existsSync(extensionPackagesDir)) {
    const packages = fs.readdirSync(extensionPackagesDir);
    
    for (const packageName of packages) {
      if (packageName === extensionName) {
        // Skip the extension package itself, already handled above
        continue;
      }
      
      const sourcePackageDir = path.join(extensionPackagesDir, packageName);
      const targetPackageDir = path.join(targetPackagesDir, packageName);
      
      if (fs.existsSync(targetPackageDir)) {
        // Merge files into existing package
        mergeDirectoryRecursive(sourcePackageDir, targetPackageDir);
        prettyLog.info(`Merged extension files into existing package: ${packageName}`);
      } else {
        // Copy entire package if it doesn't exist
        copyDirectoryRecursive(sourcePackageDir, targetPackageDir);
        prettyLog.info(`Copied new package: ${packageName}`);
      }
    }
  }
}

async function mergePackageJsonFiles(tempDir: string, targetPackagesDir: string, extensionName: string) {
  // First try the expected structure: tempDir/packages
  let extensionPackagesDir = path.join(tempDir, "packages");
  
  // If not found, try the actual structure: tempDir/extensions/packages
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
    
    // Only merge if target package exists
    if (fs.existsSync(targetPackageDir)) {
      const sourcePackageJsonPath = path.join(sourcePackageDir, "package.json");
      const targetPackageJsonPath = path.join(targetPackageDir, "package.json");
      
      if (fs.existsSync(sourcePackageJsonPath) && fs.existsSync(targetPackageJsonPath)) {
        mergePackageJson(sourcePackageJsonPath, targetPackageJsonPath);
        prettyLog.info(`Merged package.json for: ${packageName}`);
      }
    }
  }
}

async function mergeRootPackageJson(tempDir: string, targetDirectory: string, extensionName: string) {
  // First try the expected structure: tempDir/package.json
  let extensionRootPackageJsonPath = path.join(tempDir, "package.json");
  
  // If not found, try the actual structure: tempDir/extensions/package.json
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
    prettyLog.info(`Merged root package.json with extension scripts and workspace`);
  }
}

function mergePackageJson(sourcePath: string, targetPath: string) {
  try {
    const sourcePackageJson = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const targetPackageJson = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    
    // Merge scripts
    if (sourcePackageJson.scripts && targetPackageJson.scripts) {
      targetPackageJson.scripts = { ...targetPackageJson.scripts, ...sourcePackageJson.scripts };
    }
    
    // Merge dependencies
    if (sourcePackageJson.dependencies && targetPackageJson.dependencies) {
      targetPackageJson.dependencies = { ...targetPackageJson.dependencies, ...sourcePackageJson.dependencies };
    }
    
    // Merge devDependencies
    if (sourcePackageJson.devDependencies && targetPackageJson.devDependencies) {
      targetPackageJson.devDependencies = { ...targetPackageJson.devDependencies, ...sourcePackageJson.devDependencies };
    }
    
    // Merge peerDependencies
    if (sourcePackageJson.peerDependencies && targetPackageJson.peerDependencies) {
      targetPackageJson.peerDependencies = { ...targetPackageJson.peerDependencies, ...sourcePackageJson.peerDependencies };
    }
    
    // Write the merged package.json back
    fs.writeFileSync(targetPath, JSON.stringify(targetPackageJson, null, 2));
    
  } catch (error) {
    prettyLog.error(`Failed to merge package.json: ${error}`);
  }
}

function addPackageToWorkspaces(packageJsonPath: string, packageName: string) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Add the package to workspaces if it doesn't already exist
    if (packageJson.workspaces && packageJson.workspaces.packages) {
      const workspacePath = `packages/${packageName}`;
      if (!packageJson.workspaces.packages.includes(workspacePath)) {
        packageJson.workspaces.packages.push(workspacePath);
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        prettyLog.info(`Added ${packageName} to workspaces`);
      }
    }
  } catch (error) {
    prettyLog.error(`Failed to add package to workspaces: ${error}`);
  }
}

function copyDirectoryRecursive(source: string, destination: string) {
  // Create destination directory
  fs.mkdirSync(destination, { recursive: true });
  
  // Read source directory
  const files = fs.readdirSync(source);
  
  for (const file of files) {
    const sourcePath = path.join(source, file);
    const destPath = path.join(destination, file);
    
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      // Recursively copy subdirectories
      copyDirectoryRecursive(sourcePath, destPath);
    } else {
      // Copy files
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

function mergeDirectoryRecursive(source: string, destination: string) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }
  
  // Read source directory
  const files = fs.readdirSync(source);
  
  for (const file of files) {
    const sourcePath = path.join(source, file);
    const destPath = path.join(destination, file);
    
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      // Recursively merge subdirectories
      mergeDirectoryRecursive(sourcePath, destPath);
    } else {
      // Copy files (will overwrite if they exist)
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}