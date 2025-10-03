import type { Args, RawOptions } from "../types";
import arg from "arg";

// TODO update smartContractFramework code with general extensions
export function parseArgumentsIntoOptions(rawArgs: Args): RawOptions {
  const args = arg(
    {
      "--install": Boolean,
      "-i": "--install",

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

  const installFlag = args["--install"] ?? null;
  const skipInstallFlag = args["--skip-install"] ?? null;

  // - If both or neither: null
  const install =
    installFlag === skipInstallFlag ? null : installFlag ? true : false;

  const dev = args["--dev"] ?? false; // info: use false avoid asking user

  const directory = args["--dir"] ?? null;

  const extension = args["--extension"] ?? null;

  return {
    directory,
    install,
    dev,
    extension,
  };
}
