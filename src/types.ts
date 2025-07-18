export type Args = string[];

export type RawOptions = {
  directory: string | null;
  install: boolean | null;
  dev: boolean;
  extension: string | null;
};

type NonNullableRawOptions = {
  [Prop in keyof RawOptions]: NonNullable<RawOptions[Prop]>;
};

export type Options = NonNullableRawOptions;

export const isDefined = <T>(item: T | undefined | null): item is T =>
  item !== undefined && item !== null;

export type TemplateDescriptor = {
  path: string;
  fileUrl: string;
  relativePath: string;
  source: string;
};

export type Extension = {
  extensionFlagValue: string;
  description: string;
  repository: string;
  branch: string;
};
