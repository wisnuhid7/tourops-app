/**
 * normalizers.ts
 *
 * Cell-level coercion helpers used by parseWorkbook().
 *
 * These are extracted verbatim from the original parseWorkbook() so that
 * parsing semantics (blank handling, defaults, decimal-string preservation)
 * are unchanged. Each takes `unknown` and coerces through `String(v ?? "")`,
 * exactly like the originals.
 */

/** Split a comma-separated cell into a trimmed, non-empty string list. */
export const list = (v: unknown): string[] =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Trimmed string, or undefined when blank. */
export const str = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim();
  return s || undefined;
};

/**
 * Trimmed string preserved as-is (used for decimals), or undefined when blank.
 * NOTE: returns a string, never a number — callers rely on this to avoid
 * floating-point drift for money fields.
 */
export const num = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim();
  return s === "" ? undefined : s;
};

/**
 * Flag where blank/unknown → false.
 * Accepts "true" / "1" / "yes" (case-insensitive).
 * Used for isOptional and bookingRequired.
 */
export const boolFalse = (v: unknown): boolean => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
};

/**
 * Flag where blank/unknown → true.
 * Only "false" / "no" / "0" (case-insensitive) disable it.
 * Used for allowPublicJoin.
 */
export const boolTrue = (v: unknown): boolean => {
  const s = String(v ?? "").trim().toLowerCase();
  return !(s === "false" || s === "no" || s === "0");
};
