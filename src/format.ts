import * as z from "zod/v4";

export const CHARACTER_LIMIT = 25_000;

export const formatArg = z
  .enum(["markdown", "json"])
  .default("markdown")
  .describe("'markdown' for readable text (default), 'json' for structured data");

export type Format = z.infer<typeof formatArg>;

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
}

export const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });

/** JSON mode returns structuredContent plus the same data as text; markdown mode returns only the text. */
export function respond(format: Format, data: Record<string, unknown>, markdown: () => string): ToolResult {
  if (format === "json") return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
  return text(markdown());
}

/**
 * Stays under CHARACTER_LIMIT by returning fewer items, never by cutting text.
 * `trimmed` is true when items were dropped: the Graph cursor then skips them, so builders should say
 * "call again with a smaller limit" instead of offering the next cursor.
 */
export function fitItems<T>(items: T[], build: (items: T[], trimmed: boolean) => ToolResult): ToolResult {
  let kept = items;
  let result = build(kept, false);
  while (kept.length > 1 && result.content[0].text.length > CHARACTER_LIMIT) {
    kept = kept.slice(0, Math.ceil(kept.length / 2));
    result = build(kept, true);
  }
  return result;
}

export function when(iso?: string): string {
  if (!iso) return "unknown time";
  const d = new Date(iso.replace(/\+0000$/, "Z"));
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export const num = (n?: number) => (n === undefined ? "–" : n.toLocaleString("en-US"));

export function short(s: string | undefined, max = 120): string {
  if (!s) return "(no caption)";
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

/** Graph API cursor paging: `paging.cursors.after` is present only when `paging.next` is. */
export interface Paged<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}
export const nextCursor = (p: Paged<unknown>) => (p.paging?.next ? p.paging.cursors?.after : undefined);
