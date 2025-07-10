import type { Args, RawOptions } from "../types";
import arg from "arg";

// TODO update smartContractFramework code with general extensions
export function parseArgumentsIntoOptions(rawArgs: Args): RawOptions {
  const args = arg(
    {
      "--skip-install": Boolean,
      "-s": "--skip-install",

      "--dev": Boolean,

      "--dir": String,
      "-d": "--dir",

      "--extension": String,
      "-e": "--extension",
    },
    {
      argv: rawArgs.slice(2).map((a) => a.toLowerCase()),
    },
  );

  const skipInstall = args["--skip-install"] ?? null;

  const dev = args["--dev"] ?? false; // info: use false avoid asking user

  const directory = args["--dir"] ?? null;

  const extension = args["--extension"] ?? null;

  return {
    directory,
    install: skipInstall ? false : null,
    dev,
    extension,
  };
}
