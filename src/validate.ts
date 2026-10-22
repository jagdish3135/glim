/** Instagram's caption limits. Checked before any API call so nothing half-publishes. */
export const CAPTION_MAX = 2200;
export const HASHTAG_MAX = 30;
export const MENTION_MAX = 20;
export const DM_MAX_BYTES = 1000;

export function captionProblems(caption: string): string[] {
  const problems: string[] = [];
  if (caption.length > CAPTION_MAX) problems.push(`Caption is ${caption.length} characters; Instagram allows ${CAPTION_MAX}.`);
  const tags = caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (tags > HASHTAG_MAX) problems.push(`Caption has ${tags} hashtags; Instagram allows ${HASHTAG_MAX}.`);
  const mentions = caption.match(/(^|\s)@[\w.]+/g)?.length ?? 0;
  if (mentions > MENTION_MAX) problems.push(`Caption has ${mentions} @mentions; Instagram allows ${MENTION_MAX}.`);
  return problems;
}

/** Instagram fetches media itself, so the URL must be public HTTPS (no localhost or private network). */
export function mediaUrlProblem(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `"${raw}" isn't a valid URL. Use a public https:// link to the file.`;
  }
  if (url.protocol !== "https:") return `"${raw}" must use https:// so Instagram can fetch it.`;
  const host = url.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) ||
    host.startsWith("[")
  ) {
    return `"${raw}" points to a private address. Instagram's servers download the file, so host it at a public URL.`;
  }
  return undefined;
}

export function dmProblem(message: string): string | undefined {
  const bytes = Buffer.byteLength(message, "utf8");
  if (!message.trim()) return "The message is empty.";
  if (bytes > DM_MAX_BYTES) return `The message is ${bytes} bytes; Instagram DMs allow ${DM_MAX_BYTES} bytes. Shorten it or split it.`;
  return undefined;
}
