import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { formatArg, num, respond, short, when, type Paged } from "../format.js";
import type { Graph } from "../graph.js";
import { READ } from "./account.js";

interface PublicMedia { id: string; caption?: string; media_type?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number }

export function registerHashtagTools(server: McpServer, graph: Graph) {
  server.registerTool(
    "ig_search_hashtag",
    {
      title: "Search a hashtag",
      description: `Find public posts for a hashtag: 'top' (most popular) or 'recent' (last 24 hours only).
Meta limits this to 30 unique hashtags per 7 days per account, and it needs a Facebook Login token with Instagram Public Content Access.
Example: "What's trending under #punefood?" -> hashtag='punefood', kind='top'.`,
      inputSchema: z.strictObject({
        hashtag: z.string().regex(/^#?[\p{L}\p{N}_]{1,100}$/u, "A hashtag is letters, numbers and underscores, e.g. 'punefood'").describe("Hashtag with or without '#'"),
        kind: z.enum(["top", "recent"]).default("top"),
        limit: z.number().int().min(1).max(50).default(10),
        response_format: formatArg
      }),
      annotations: READ
    },
    async ({ hashtag: raw, kind, limit, response_format }, ctx) => {
      graph.requireLogin("facebook", "Hashtag search");
      const hashtag = raw.replace(/^#/, "");
      const signal = ctx.mcpReq.signal;
      const user_id = await graph.userId(signal);
      const found = await graph.get<{ data: { id: string }[] }>("ig_hashtag_search", { user_id, q: hashtag }, signal);
      const tagId = found.data[0]?.id;
      if (!tagId) return respond(response_format, { hashtag, posts: [] }, () => `No hashtag #${hashtag} found.`);
      const res = await graph.get<Paged<PublicMedia>>(
        `${tagId}/${kind}_media`,
        { user_id, fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count", limit },
        signal
      );
      const posts = res.data.slice(0, limit);
      return respond(response_format, { hashtag, hashtag_id: tagId, kind, posts }, () =>
        posts.length
          ? [`# ${kind === "top" ? "Top" : "Recent"} posts for #${hashtag} (${posts.length})`,
             ...posts.map((p) => `- ${when(p.timestamp)} · ❤ ${num(p.like_count)} · 💬 ${num(p.comments_count)} · ${p.permalink ?? p.id}\n  ${short(p.caption)}`)].join("\n")
          : `No ${kind} posts for #${hashtag}${kind === "recent" ? " in the last 24 hours" : ""}.`
      );
    }
  );
}
