import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { fitItems, formatArg, nextCursor, num, respond, short, when, type Paged } from "../format.js";
import type { Graph } from "../graph.js";

export const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
export const idArg = (what: string) => z.string().regex(/^[\w-]{3,200}$/, `Not a valid ${what} ID`);

const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";

export interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  children?: { data: { id: string; media_type?: string; media_url?: string }[] };
}

export const kindOf = (m: MediaItem) =>
  m.media_product_type === "REELS" ? "Reel" : m.media_product_type === "STORY" ? "Story" : m.media_type === "CAROUSEL_ALBUM" ? "Carousel" : m.media_type === "VIDEO" ? "Video" : "Photo";

export function registerAccountTools(server: McpServer, graph: Graph) {
  server.registerTool(
    "ig_get_profile",
    {
      title: "Get Instagram profile",
      description: `Get the connected Instagram professional account: username, name, bio, website, followers, following and post count.
Also says whether Glim is in demo mode (fictional sample account) or live. Call this first to check the connection.`,
      inputSchema: z.strictObject({ response_format: formatArg }),
      annotations: READ
    },
    async ({ response_format }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const id = await graph.userId(signal);
      const p = await graph.get<Record<string, string | number | undefined>>(
        id,
        { fields: "id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count" },
        signal
      );
      const mode = graph.loginType === "demo" ? "demo (fictional sample account; set INSTAGRAM_ACCESS_TOKEN to go live)" : `live (${graph.loginType} login)`;
      return respond(response_format, { ...p, mode: graph.loginType }, () =>
        [
          `# @${p.username}${p.name ? ` · ${p.name}` : ""}`,
          `- Account ID: ${p.id}`,
          `- Followers: ${num(p.followers_count as number)} · Following: ${num(p.follows_count as number)} · Posts: ${num(p.media_count as number)}`,
          p.biography ? `- Bio: ${p.biography}` : "",
          p.website ? `- Website: ${p.website}` : "",
          `- Mode: ${mode}`
        ].filter(Boolean).join("\n")
      );
    }
  );

  server.registerTool(
    "ig_list_media",
    {
      title: "List posts",
      description: `List the account's posts, reels and carousels, newest first, with likes and comment counts.
Returns a page; when more exist the result gives an 'after' cursor to pass back for the next page.
Use ig_get_media for one post's full details, ig_get_media_insights for its views and reach.`,
      inputSchema: z.strictObject({
        limit: z.number().int().min(1).max(50).default(12).describe("How many posts to return (1-50)"),
        after: z.string().max(500).optional().describe("Cursor from a previous result, for the next page"),
        response_format: formatArg
      }),
      annotations: READ
    },
    async ({ limit, after, response_format }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const id = await graph.userId(signal);
      const res = await graph.get<Paged<MediaItem>>(`${id}/media`, { fields: MEDIA_FIELDS, limit, after }, signal);
      const cursor = nextCursor(res);
      if (!res.data.length) return respond(response_format, { count: 0, media: [] }, () => "No posts yet on this account.");
      return fitItems(res.data, (items, trimmed) => {
        const more = !trimmed && cursor ? { has_more: true, after: cursor } : { has_more: trimmed };
        return respond(response_format, { count: items.length, media: items, ...more }, () =>
          [
            `# Posts (${items.length})`,
            ...items.map((m) => `- **${kindOf(m)}** ${when(m.timestamp)} · ❤ ${num(m.like_count)} · 💬 ${num(m.comments_count)} · id ${m.id}\n  ${short(m.caption)}\n  ${m.permalink ?? ""}`),
            trimmed ? "\nResult trimmed to fit; call again with a smaller limit." : cursor ? `\nMore posts: call again with after="${cursor}".` : ""
          ].join("\n")
        );
      });
    }
  );

  server.registerTool(
    "ig_get_media",
    {
      title: "Get one post",
      description: "Get one post, reel or carousel by ID: full caption, type, media URL, permalink, likes, comment count and carousel slides. IDs come from ig_list_media.",
      inputSchema: z.strictObject({ media_id: idArg("media").describe("Media ID, e.g. '17900000000000001'"), response_format: formatArg }),
      annotations: READ
    },
    async ({ media_id, response_format }, ctx) => {
      const m = await graph.get<MediaItem>(
        media_id,
        { fields: `${MEDIA_FIELDS},media_url,thumbnail_url,children{id,media_type,media_url}` },
        ctx.mcpReq.signal
      );
      return respond(response_format, { ...m }, () =>
        [
          `# ${kindOf(m)} ${m.id}`,
          `- Posted: ${when(m.timestamp)}`,
          `- Likes: ${num(m.like_count)} · Comments: ${num(m.comments_count)}`,
          `- Link: ${m.permalink ?? "–"}`,
          `- Media URL: ${m.media_url ?? m.thumbnail_url ?? "–"}`,
          m.children?.data.length ? `- Slides: ${m.children.data.length}` : "",
          "",
          m.caption ?? "(no caption)"
        ].filter((l) => l !== "").join("\n")
      );
    }
  );
}
