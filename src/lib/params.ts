import { categoryBySlug } from "@/config/categories";
import { SLUG_RE } from "@/lib/text";

/** Query string values arrive as string | string[] | undefined; only a single short value is used. */
export type SearchParams = Record<string, string | string[] | undefined>;

export function one(params: SearchParams, key: string, max = 80): string {
  const v = params[key];
  const s = (Array.isArray(v) ? v[0] : v) ?? "";
  return s.slice(0, max).trim();
}

export function pageParam(params: SearchParams): number {
  const n = Number(one(params, "page", 5));
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}

export function categoryParam(params: SearchParams): string | undefined {
  const c = one(params, "category", 40);
  return categoryBySlug(c) ? c : undefined;
}

export function slugParam(params: SearchParams, key: string): string | undefined {
  const s = one(params, key, 80);
  return SLUG_RE.test(s) ? s : undefined;
}

export function enumParam<T extends string>(params: SearchParams, key: string, allowed: readonly T[]): T | undefined {
  const s = one(params, key, 30) as T;
  return allowed.includes(s) ? s : undefined;
}

/** Builds "/path/?a=1&b=2" from defined values only. */
export function withQuery(path: string, q: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}
