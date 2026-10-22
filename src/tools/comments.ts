import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { fitItems, formatArg, nextCursor, num, respond, text, when, type Paged } from "../format.js";
import type { Graph } from "../graph.js";
import { READ, idArg } from "./account.js";

interface Comment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  like_count?: number;
  hidden?: boolean;
  replies?: { data: Comment[] };
}

const FIELDS = "id,text,username,timestamp,like_count,hidden";
const line = (c: Comment, indent = "") =>
  `${indent}- @${c.username ?? "unknown"} · ${when(c.timestamp)} · ❤ ${num(c.like_count)}${c.hidden ? " · hidden" : ""} · id ${c.id}\n${indent}  ${c.text ?? ""}`;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true } as const;

export function registerCommentTools(server: McpServer, graph: Graph) {
  server.registerTool(
    "ig_list_comments",
    {
      title: "List comments",
      description: `List comments on one of the account's posts, newest first, with replies, likes and hidden state.
Use comment IDs with ig_reply_to_comment, ig_hide_comment or ig_delete_comment. Get media IDs from ig_list_media.`,
      inputSchema: z.strictObject({
        media_id: idArg("media"),
        limit: z.number().int().min(1).max(50).default(25),
        after: z.string().max(500).optional().describe("Cursor from a previous result, for the next page"),
        response_format: formatArg
      }),
      annotations: READ
    },
    async ({ media_id, limit, after, response_format }, ctx) => {
      const res = await graph.get<Paged<Comment>>(
        `${media_id}/comments`,
        { fields: `${FIELDS},replies{${FIELDS}}`, limit, after },
        ctx.mcpReq.signal
      );
      const cursor = nextCursor(res);
      if (!res.data.length) return respond(response_format, { count: 0, comments: [] }, () => "No comments on this post yet.");
      return fitItems(res.data, (items, trimmed) =>
        respond(response_format, { count: items.length, comments: items, has_more: trimmed || Boolean(cursor), ...(cursor && !trimmed ? { after: cursor } : {}) }, () =>
          [
            `# Comments on ${media_id} (${items.length})`,
            ...items.map((c) => [line(c), ...(c.replies?.data ?? []).map((r) => line(r, "    "))].join("\n")),
            trimmed ? "\nResult trimmed to fit; call again with a smaller limit." : cursor ? `\nMore comments: call again with after="${cursor}".` : ""
          ].join("\n")
        )
      );
    }
  );

  server.registerTool(
    "ig_reply_to_comment",
    {
      title: "Reply to a comment",
      description: `Post a public reply. Give comment_id to reply under a comment, or media_id to add a new top-level comment on a post.
Replies are public and appear as the account. Instagram only allows replies to top-level comments.`,
      inputSchema: z.strictObject({
        comment_id: idArg("comment").optional(),
        media_id: idArg("media").optional(),
        message: z.string().trim().min(1).max(2200).describe("Reply text")
      }),
      annotations: { ...WRITE, idempotentHint: false }
    },
    async ({ comment_id, media_id, message }, ctx) => {
      if (Boolean(comment_id) === Boolean(media_id)) throw new Error("Give exactly one of comment_id (reply to a comment) or media_id (new comment on a post).");
      const path = comment_id ? `${comment_id}/replies` : `${media_id}/comments`;
      const res = await graph.post<{ id: string }>(path, { message }, ctx.mcpReq.signal);
      return text(`Posted ${comment_id ? "reply" : "comment"} ${res.id}.`);
    }
  );

  server.registerTool(
    "ig_hide_comment",
    {
      title: "Hide or unhide a comment",
      description: "Hide a comment (e.g. spam or abuse) so only its author still sees it, or unhide it. Reversible; prefer this over deleting.",
      inputSchema: z.strictObject({ comment_id: idArg("comment"), hide: z.boolean().default(true).describe("true to hide, false to unhide") }),
      annotations: { ...WRITE, idempotentHint: true }
    },
    async ({ comment_id, hide }, ctx) => {
      await graph.post(comment_id, { hide }, ctx.mcpReq.signal);
      return text(`Comment ${comment_id} is now ${hide ? "hidden" : "visible"}.`);
    }
  );

  server.registerTool(
    "ig_delete_comment",
    {
      title: "Delete a comment",
      description: "Permanently delete a comment on the account's own post. Can't be undone; confirm with the user first, and consider ig_hide_comment instead.",
      inputSchema: z.strictObject({ comment_id: idArg("comment") }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ comment_id }, ctx) => {
      await graph.delete(comment_id, ctx.mcpReq.signal);
      return text(`Deleted comment ${comment_id}.`);
    }
  );
}
