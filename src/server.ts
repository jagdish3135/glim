import { McpServer } from "@modelcontextprotocol/server";
import type { Graph } from "./graph.js";
import { registerAccountTools } from "./tools/account.js";
import { registerCommentTools } from "./tools/comments.js";
import { registerHashtagTools } from "./tools/hashtags.js";
import { registerInsightTools } from "./tools/insights.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerPublishTools } from "./tools/publish.js";

export const VERSION = "0.1.0";

const INSTRUCTIONS = `Glim manages one Instagram professional account through Meta's official Graph API.
- Start with ig_get_profile to see the account and whether this is demo mode (fictional data) or live.
- Publishing is two steps: ig_prepare_post makes a private draft and preview; only call ig_publish_post after the user confirms.
- Ask before deleting comments or sending DMs. Prefer ig_hide_comment for spam.
- DMs can only be sent within 24 hours of the person's last message.`;

export function createServer(graph: Graph): McpServer {
  const server = new McpServer({ name: "glim-mcp", title: "Glim (Instagram)", version: VERSION }, { instructions: INSTRUCTIONS });
  registerAccountTools(server, graph);
  registerInsightTools(server, graph);
  registerPublishTools(server, graph);
  registerCommentTools(server, graph);
  registerMessageTools(server, graph);
  registerHashtagTools(server, graph);
  return server;
}
