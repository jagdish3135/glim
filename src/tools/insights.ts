import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { formatArg, num, respond } from "../format.js";
import type { Graph } from "../graph.js";
import { READ, idArg, kindOf, type MediaItem } from "./account.js";

/** Meta renames metrics often (impressions -> views in 2025); keep every list in this one place. */
export const ACCOUNT_METRICS = ["views", "reach", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "replies", "reposts", "follows_and_unfollows", "profile_links_taps"] as const;
export const MEDIA_DEFAULTS: Record<string, string[]> = {
  FEED: ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"],
  REELS: ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time"],
  STORY: ["views", "reach", "replies", "shares", "total_interactions"]
};

interface Insight {
  name: string;
  title?: string;
  values?: { value: number }[];
  total_value?: { value?: number; breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] };
}

export const insightValue = (i: Insight) => i.total_value?.value ?? i.values?.at(-1)?.value ?? 0;
const label = (name: string) => name.replace(/^ig_reels_/, "").replace(/_/g, " ");
const fmtValue = (name: string, v: number) => (name.endsWith("watch_time") ? `${(v / 1000).toFixed(1)} s` : num(v));

export function registerInsightTools(server: McpServer, graph: Graph) {
  server.registerTool(
    "ig_get_account_insights",
    {
      title: "Account insights",
      description: `Account-level totals over the last N days (1-30): views, reach, accounts engaged, interactions, likes, comments, shares, saves, follows and link taps.
'views' replaced the retired 'impressions' metric. Data can lag up to 48 hours. For audience age/gender/location use ig_get_audience.`,
      inputSchema: z.strictObject({
        days: z.number().int().min(1).max(30).default(7).describe("How many days back to total, ending now"),
        metrics: z.array(z.enum(ACCOUNT_METRICS)).min(1).max(12).optional().describe("Metrics to fetch; default views, reach, accounts_engaged, total_interactions, follows_and_unfollows"),
        response_format: formatArg
      }),
      annotations: READ
    },
    async ({ days, metrics, response_format }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const id = await graph.userId(signal);
      const until = Math.floor(Date.now() / 1000);
      const list = metrics ?? ["views", "reach", "accounts_engaged", "total_interactions", "follows_and_unfollows"];
      const res = await graph.get<{ data: Insight[] }>(
        `${id}/insights`,
        { metric: [...new Set(list)].join(","), period: "day", metric_type: "total_value", since: until - days * 86400, until },
        signal
      );
      const totals = Object.fromEntries(res.data.map((i) => [i.name, insightValue(i)]));
      return respond(response_format, { days, totals }, () =>
        [`# Account insights, last ${days} day${days > 1 ? "s" : ""}`, ...res.data.map((i) => `- ${label(i.name)}: ${num(insightValue(i))}`)].join("\n")
      );
    }
  );

  server.registerTool(
    "ig_get_audience",
    {
      title: "Audience demographics",
      description: `Who follows or engages with the account, broken down by country, city, age or gender. Needs at least 100 followers on a live account.
'followers' = follower demographics; 'engaged' = people who interacted with content in the timeframe.`,
      inputSchema: z.strictObject({
        audience: z.enum(["followers", "engaged"]).default("followers"),
        breakdown: z.enum(["country", "city", "age", "gender"]).default("country"),
        timeframe: z.enum(["this_week", "this_month"]).default("this_month"),
        response_format: formatArg
      }),
      annotations: READ
    },
    async ({ audience, breakdown, timeframe, response_format }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const id = await graph.userId(signal);
      const metric = audience === "followers" ? "follower_demographics" : "engaged_audience_demographics";
      const res = await graph.get<{ data: Insight[] }>(
        `${id}/insights`,
        { metric, period: "lifetime", metric_type: "total_value", breakdown, timeframe },
        signal
      );
      const rows = (res.data[0]?.total_value?.breakdowns?.[0]?.results ?? [])
        .map((r) => ({ key: r.dimension_values.join(" / "), value: r.value }))
        .sort((a, b) => b.value - a.value);
      const total = rows.reduce((a, r) => a + r.value, 0);
      return respond(response_format, { audience, breakdown, timeframe, rows }, () =>
        rows.length
          ? [`# ${audience === "followers" ? "Followers" : "Engaged audience"} by ${breakdown} (${timeframe.replace("_", " ")})`,
             ...rows.map((r) => `- ${r.key}: ${num(r.value)} (${((r.value / total) * 100).toFixed(1)}%)`)].join("\n")
          : "No demographic data yet. Instagram shows demographics only for accounts with 100+ followers."
      );
    }
  );

  server.registerTool(
    "ig_get_media_insights",
    {
      title: "Post insights",
      description: `Views, reach, likes, comments, shares, saves and interactions for one post, reel or story. Reels also get average watch time.
Picks the right metrics for the post type automatically; pass 'metrics' to choose your own. IDs come from ig_list_media.`,
      inputSchema: z.strictObject({
        media_id: idArg("media"),
        metrics: z.array(z.string().regex(/^[a-z_]{2,60}$/)).min(1).max(12).optional().describe("Override the default metrics, e.g. ['views','saved']"),
        response_format: formatArg
      }),
      annotations: READ
    },
    async ({ media_id, metrics, response_format }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const m = await graph.get<MediaItem>(media_id, { fields: "id,media_type,media_product_type,permalink" }, signal);
      const product = m.media_product_type && MEDIA_DEFAULTS[m.media_product_type] ? m.media_product_type : "FEED";
      const list = metrics ?? MEDIA_DEFAULTS[product];
      let res: { data: Insight[] };
      try {
        res = await graph.get<{ data: Insight[] }>(`${media_id}/insights`, { metric: list.join(",") }, signal);
      } catch (e) {
        throw new Error(`${(e as Error).message} Default metrics for a ${kindOf(m)}: ${MEDIA_DEFAULTS[product].join(", ")}.`);
      }
      const values = Object.fromEntries(res.data.map((i) => [i.name, insightValue(i)]));
      return respond(response_format, { media_id, type: kindOf(m), metrics: values }, () =>
        [`# ${kindOf(m)} ${media_id} insights`, m.permalink ?? "", ...res.data.map((i) => `- ${label(i.name)}: ${fmtValue(i.name, insightValue(i))}`)]
          .filter(Boolean).join("\n")
      );
    }
  );
}
