import { Options, RawOptions } from "../types";
import inquirer from "inquirer";
import { loadExtensions } from "./load-extensions";

// default values for unspecified args
const defaultOptions: RawOptions = {
  directory: "./my-dapp-example",
  install: true,
  dev: false,
  extension: null,
};

export async function promptForMissingOptions(
  options: RawOptions,
): Promise<Options> {
  const cliAnswers = Object.fromEntries(
    Object.entries(options).filter(([key, value]) => value !== null),
  );

  const extensions = loadExtensions();
  const extensionChoices = extensions.map(ext => ({
    name: `${ext.extensionFlagValue} - ${ext.description}`,
    value: ext.extensionFlagValue,
  }));

  const questions = [
    {
      type: "input",
      name: "directory",
      message:
        "Where do you want to install the new files? Choose ./ (root folder) or provide a new folder name.",
      default: defaultOptions.directory,
      validate: (value: string) => value.length > 0,
    },
    {
      type: "confirm",
      name: "install",
      message: "Install dependencies?",
      default: defaultOptions.install,
    },
  ];

  const answers = await inquirer.prompt(questions, cliAnswers);

  const mergedOptions: Options = {
    directory: options.directory ?? answers.directory,
    install: options.install ?? answers.install,
    dev: options.dev ?? defaultOptions.dev,
    extension: options.extension ?? answers.extension,
  };

  return mergedOptions;
}
