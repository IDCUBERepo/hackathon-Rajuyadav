import { en, type Strings } from './en';

export const strings: Strings = en;

type StringKey = {
  [K in keyof Strings]: Strings[K] extends string ? K : never;
}[keyof Strings];

/** Look up a string and fill in {placeholders}. */
export function t(key: StringKey, params: Record<string, string | number> = {}): string {
  return fill(strings[key], params);
}

export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
