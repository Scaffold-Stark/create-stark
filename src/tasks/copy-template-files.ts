import { execa } from "execa";
import { Options, TemplateDescriptor } from "../types";
import { baseDir } from "../utils/consts";
import { findFilesRecursiveSync } from "../utils/find-files-recursively";
import { mergePackageJson } from "../utils/merge-package-json";
import fs from "fs";
import url from 'url';
import ncp from "ncp";
import path from "path";
import { promisify } from "util";
import link from "../utils/link";
import { copyExtensionFile } from "./copy-extension-file";

const copy = promisify(ncp);
let copyOrLink = copy;

const isTemplateRegex = /([^\/\\]*?)\.template\./;
const isPackageJsonRegex = /package\.json/;
const isYarnLockRegex = /yarn\.lock/;
const isNextGeneratedRegex = /packages\/nextjs\/generated/;
const isArgsRegex = /([^\/\\]*?)\.args\./;
const isGitKeepRegex = /\.gitkeep/;

// Additional files/directories to exclude from template copying
const excludePatterns = [
  /\.github\//,               // GitHub specific files todo: add workflows/main.yml later
  /CHANGELOG\.md/,            // Changelog file
  /__test.*__/,               // All test directories (__test__, __tests__, etc.)
];

const copyBaseFiles = async (
    { dev: isDev }: Options,
    basePath: string,
    targetDir: string
  ) => {
  await copyOrLink(basePath, targetDir, {
    clobber: false,
    filter: (fileName) => {  // NOTE: filter IN
      const isTemplate = isTemplateRegex.test(fileName);
      const isPackageJson = isPackageJsonRegex.test(fileName);
      const isYarnLock = isYarnLockRegex.test(fileName);
      const isNextGenerated = isNextGeneratedRegex.test(fileName);
      const isGitKeep = isGitKeepRegex.test(fileName);

      // Check if file matches any exclude pattern
      const isExcluded = excludePatterns.some(pattern => pattern.test(fileName));

      const skipAlways = isPackageJson || isGitKeep || isExcluded;
      const skipDevOnly = isYarnLock || isNextGenerated;
      const shouldSkip = skipAlways || (isDev && skipDevOnly);

      return !shouldSkip;
    },
  });

  ["snfoundry", "nextjs"].forEach(packageName => {
    const envExamplePath = path.join(basePath, "packages", packageName, ".env.example");
    const envPath = path.join(targetDir, "packages", packageName, ".env");
    if (fs.existsSync(envExamplePath)) {
      copy(envExamplePath, envPath);
    }
  });

  const basePackageJsonPaths = findFilesRecursiveSync(basePath, (path: string) => isPackageJsonRegex.test(path));

  basePackageJsonPaths.forEach((packageJsonPath: string) => {
    const partialPath = packageJsonPath.split(basePath)[1];
    mergePackageJson(
      path.join(targetDir, partialPath),
      path.join(basePath, partialPath),
      isDev
    );
  });

  if (isDev) {
    const baseYarnLockPaths = findFilesRecursiveSync(basePath, (path: string) => isYarnLockRegex.test(path));
    baseYarnLockPaths.forEach((yarnLockPath: string) => {
      const partialPath = yarnLockPath.split(basePath)[1];
      copy(
        path.join(basePath, partialPath),
        path.join(targetDir, partialPath)
      );
    });

    const nextGeneratedPaths = findFilesRecursiveSync(basePath, (path: string) => isNextGeneratedRegex.test(path));
    nextGeneratedPaths.forEach((nextGeneratedPath: string) => {
      const partialPath = nextGeneratedPath.split(basePath)[1];
      copy(
        path.join(basePath, partialPath),
        path.join(targetDir, partialPath)
      );
    });
  }
};



const processTemplatedFiles = async (
  { dev: isDev, extension }: Options,
  basePath: string,
  targetDir: string
) => {
  const baseTemplatedFileDescriptors: TemplateDescriptor[] =
    findFilesRecursiveSync(basePath, (path: string) => isTemplateRegex.test(path)).map(
      (baseTemplatePath: string) => ({
        path: baseTemplatePath,
        fileUrl: url.pathToFileURL(baseTemplatePath).href,
        relativePath: baseTemplatePath.split(basePath)[1],
        source: "base",
      })
    );

  await Promise.all(
    baseTemplatedFileDescriptors.map(async (templateFileDescriptor) => {
      const templateTargetName =
        templateFileDescriptor.path.match(isTemplateRegex)?.[1]!;

      const argsPath = templateFileDescriptor.relativePath.replace(
        isTemplateRegex,
        `${templateTargetName}.args.`
      );

      // Load the template
      const template = (await import(templateFileDescriptor.fileUrl)).default;

      if (!template) {
        throw new Error(
          `Template ${templateTargetName} from ${templateFileDescriptor.source} doesn't have a default export`
        );
      }
      if (typeof template !== "function") {
        throw new Error(
          `Template ${templateTargetName} from ${templateFileDescriptor.source} is not exporting a function by default`
        );
      }

      // Collect args from multiple sources
      const argsFileUrls = [];

      // Check for args in target directory (from extensions)
      if (extension) {
        const extensionArgsPath = path.join(targetDir, argsPath);
        if (fs.existsSync(extensionArgsPath)) {
          argsFileUrls.push(url.pathToFileURL(extensionArgsPath).href);
        }
      }

      // Load and combine all args
      const argsModules = await Promise.all(
        argsFileUrls.map(async (argsFileUrl) => {
          try {
            return await import(argsFileUrl) as Record<string, any>;
          } catch (error) {
            console.warn(`Failed to load args from: ${argsFileUrl}`);
            return {};
          }
        })
      );

      // Combine all args into a single object
      const combinedArgs = argsModules.reduce((acc, module) => {
        return { ...acc, ...module };
      }, {});

      // Execute template with combined args
      const output = template(combinedArgs);

      const targetPath = path.join(
        targetDir,
        templateFileDescriptor.relativePath.split(templateTargetName)[0],
        templateTargetName
      );
      fs.writeFileSync(targetPath, output);

      if (isDev) {
        const devOutput = `--- TEMPLATE FILE
templates/${templateFileDescriptor.source}${templateFileDescriptor.relativePath}


--- ARGS FILES
${argsFileUrls.length > 0 
  ? argsFileUrls.map(url => `\t- ${url.split("packages")[1] || url}`).join("\n")
  : "(no args files writing to the template)"}


--- RESULTING ARGS
${Object.keys(combinedArgs).length > 0
  ? Object.entries(combinedArgs)
      .map(([key, value]) => `\t- ${key}:\t${JSON.stringify(value)}`)
      .join("\n")
  : "(no args sent for the template)"}
`;
        fs.writeFileSync(`${targetPath}.dev`, devOutput);
      }
    })
  );
};

export async function copyTemplateFiles(
  options: Options,
  templateDir: string,
  targetDir: string
) {
  copyOrLink = options.dev ? link : copy;
  const basePath = path.join(templateDir, baseDir);

  // 1. Copy base template to target directory
  await copyBaseFiles(options, basePath, targetDir);

  // 2. Copy extension files if extension is provided
  if (options.extension) {
    await copyExtensionFile(options.extension, targetDir);
  }

  // 3. Process templated files with extension args
  await processTemplatedFiles(options, basePath, targetDir);

  // 4. Clean up template and args files
  await cleanupTemplateFiles(targetDir);

  // 5. Initialize git repo to avoid husky error
  await execa("git", ["init"], { cwd: targetDir });
  await execa("git", ["checkout", "-b", "main"], { cwd: targetDir });
}

async function cleanupTemplateFiles(targetDir: string) {
  const basePath = path.join(targetDir, "packages");
  
  // Find all template and args files
  const templateFiles = findFilesRecursiveSync(basePath, (path: string) => isTemplateRegex.test(path));
  const argsFiles = findFilesRecursiveSync(basePath, (path: string) => isArgsRegex.test(path));
  
  // Delete template files
  templateFiles.forEach((templatePath) => {
    try {
      fs.unlinkSync(templatePath);
    } catch (error) {
      console.warn(`Failed to delete template file: ${templatePath}`);
    }
  });
  
  // Delete args files
  argsFiles.forEach((argsPath) => {
    try {
      fs.unlinkSync(argsPath);
    } catch (error) {
      console.warn(`Failed to delete args file: ${argsPath}`);
    }
  });
}


