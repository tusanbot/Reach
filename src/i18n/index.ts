import fa from "./fa";
import en from "./en";
import ar from "./ar";

export type Lang = "fa" | "en" | "ar";
export const LANGS: Lang[] = ["fa","en","ar"];
export function normalizeLang(value: unknown): Lang {
  return value === "en" || value === "ar" ? value : "fa";
}
export function tr(lang: Lang, key: keyof typeof fa): string {
  const dict:any = lang === "en" ? en : lang === "ar" ? ar : fa;
  return dict[key] ?? fa[key] ?? String(key);
}
