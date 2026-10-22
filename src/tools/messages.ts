import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { fitItems, formatArg, nextCursor, respond, short, text, when, type Paged } from "../format.js";
import type { Graph } from "../graph.js";
import { dmProblem } from "../validate.js";
import { READ, idArg } from "./account.js";

interface Person { id: string; username?: string }
interface Conversation { id: string; updated_time?: string; participants?: { data: Person[] } }
interface Message { id: string; created_time?: string; from?: Person; message?: string }

const FEATURE = "Direct messages";

export function registerMessageTools(server: McpServer, graph: Graph) {
  server.registerTool(
    "ig_list_conversations",
    {
      title: "List DM conversations",
      description: `List the account's Instagram DM conversations, most recent first, with who they're with.
Returns conversation IDs for ig_get_messages and the other person's ID (IGSID) for ig_send_message. Needs instagram_business_manage_messages.`,
      inputSchema: z.strictObject({
        limit: z.number().int().min(1).max(50).default(20),
        after: z.string().max(500).optional().describe("Cursor from a previous result"),
        response_format: formatArg
      }),
      annotations: READ
    },
    async ({ limit, after, response_format }, ctx) => {
      graph.requireLogin("instagram", FEATURE);
      const signal = ctx.mcpReq.signal;
      const me = await graph.userId(signal);
      const res = await graph.get<Paged<Conversation>>(
        "me/conversations",
        { platform: "instagram", fields: "id,updated_time,participants", limit, after },
        signal
      );
      const cursor = nextCursor(res);
      const rows = res.data.map((c) => {
        const other = c.participants?.data.find((p) => p.id !== me) ?? c.participants?.data[0];
        return { conversation_id: c.id, with_username: other?.username, with_id: other?.id, updated: c.updated_time };
      });
      if (!rows.length) return respond(response_format, { count: 0, conversations: [] }, () => "No DM conversations found. (Requests older than 30 days without activity aren't returned.)");
      return fitItems(rows, (items, trimmed) =>
        respond(response_format, { count: items.length, conversations: items, ...(cursor && !trimmed ? { after: cursor } : {}) }, () =>
          [
            `# Conversations (${items.length})`,
            ...items.map((r) => `- @${r.with_username ?? "unknown"} (user id ${r.with_id ?? "?"}) · last activity ${when(r.updated)}\n  conversation_id: ${r.conversation_id}`),
            cursor && !trimmed ? `\nMore: call again with after="${cursor}".` : ""
          ].join("\n")
        )
      );
    }
  );

  server.registerTool(
    "ig_get_messages",
    {
      title: "Read DM messages",
      description: "Read the latest messages (up to 20, Instagram's limit) in one DM conversation, newest first. Get conversation IDs from ig_list_conversations.",
      inputSchema: z.strictObject({
        conversation_id: idArg("conversation"),
        limit: z.number().int().min(1).max(20).default(20),
        response_format: formatArg
      }),
      annotations: READ
    },
    async ({ conversation_id, limit, response_format }, ctx) => {
      graph.requireLogin("instagram", FEATURE);
      const signal = ctx.mcpReq.signal;
      const me = await graph.userId(signal);
      const res = await graph.get<{ messages?: { data: Message[] } }>(
        conversation_id,
        { fields: `messages.limit(${limit}){id,created_time,from,to,message}` },
        signal
      );
      const msgs = (res.messages?.data ?? []).map((m) => ({ id: m.id, at: m.created_time, from: m.from?.username, from_id: m.from?.id, from_me: m.from?.id === me, text: m.message ?? "" }));
      const lastTheirs = msgs.find((m) => !m.from_me);
      const windowOpen = lastTheirs?.at ? Date.now() - new Date(lastTheirs.at.replace(/\+0000$/, "Z")).getTime() < 24 * 3600_000 : false;
      return respond(response_format, { conversation_id, messages: msgs, can_reply: windowOpen }, () =>
        [
          `# Messages (${msgs.length}, newest first)`,
          ...msgs.map((m) => `- ${m.from_me ? "**You**" : `@${m.from ?? "unknown"}`} · ${when(m.at)}: ${short(m.text, 500) || "(attachment)"}`),
          "",
          windowOpen
            ? `You can reply: ig_send_message with recipient_id ${lastTheirs!.from_id}.`
            : "Their last message is over 24 hours old, so Instagram won't allow a reply until they message again."
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "ig_send_message",
    {
      title: "Send a DM",
      description: `Send a text DM as the account. Instagram allows this only within 24 hours of the person's last message to you.
recipient_id is the person's Instagram-scoped ID from ig_list_conversations or ig_get_messages. Max 1000 bytes. Confirm the text with the user first.`,
      inputSchema: z.strictObject({
        recipient_id: z.string().regex(/^\d{3,40}$/, "recipient_id is a numeric Instagram-scoped user ID"),
        text: z.string().min(1).max(1000)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ recipient_id, text: body }, ctx) => {
      graph.requireLogin("instagram", FEATURE);
      const problem = dmProblem(body);
      if (problem) throw new Error(problem);
      const signal = ctx.mcpReq.signal;
      const me = await graph.userId(signal);
      const res = await graph.post<{ message_id: string }>(`${me}/messages`, { recipient: { id: recipient_id }, message: { text: body } }, signal);
      return text(`Sent. Message ID ${res.message_id}.`);
    }
  );
}
