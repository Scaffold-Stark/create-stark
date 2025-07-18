import typescript from "@rollup/plugin-typescript";
import autoExternal from "rollup-plugin-auto-external";
import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";

export default {
  input: "src/cli.ts",
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    json(),
    nodeResolve(), 
    autoExternal(), 
    typescript({ 
      include: ["src/**/*.ts"],
      exclude: ["templates/**"] 
    })
  ],
};