/**
 * Demo mode: an in-process fake of the Instagram Graph API with a fictional account.
 * It answers the same paths and raises the same error codes as the real API, so every tool
 * (and every test) runs through the exact code path a live token would.
 */
import { GraphError, type GraphRequest, type Transport } from "./graph.js";

const UID = "17841400000000001";
const HOUR = 3_600_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace(/\.\d+Z$/, "+0000");

type MediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
type Product = "FEED" | "REELS" | "STORY";

interface Comment {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  like_count: number;
  hidden: boolean;
  replies: Comment[];
}
interface Media {
  id: string;
  caption?: string;
  media_type: MediaType;
  media_product_type: Product;
  media_url: string;
  permalink: string;
  timestamp: string;
  like_count: number;
  comments: Comment[];
  insights: Record<string, number>;
  children?: { id: string; media_type: MediaType; media_url: string }[];
}
interface Container {
  id: string;
  body: Record<string, unknown>;
  checks: number;
  published?: boolean;
}
interface Message {
  id: string;
  created_time: string;
  from: { id: string; username: string };
  message: string;
}
interface Conversation {
  id: string;
  user: { id: string; username: string };
  messages: Message[]; // newest first
}

const ME = { id: UID, username: "kettle.and.crumb" };
const VALID_METRICS: Record<Product, string[]> = {
  FEED: ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions", "follows", "profile_visits", "profile_activity"],
  REELS: ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"],
  STORY: ["views", "reach", "replies", "shares", "total_interactions", "follows", "profile_visits", "navigation"]
};
const ACCOUNT_METRICS = ["views", "reach", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "replies", "reposts", "follows_and_unfollows", "profile_links_taps"];

function seed() {
  let n = 0;
  const cid = () => `1800000000000${String(++n).padStart(4, "0")}`;
  const c = (username: string, text: string, hoursAgo: number, likes = 0, replies: Comment[] = []): Comment => ({
    id: cid(), username, text, timestamp: iso(hoursAgo * HOUR), like_count: likes, hidden: false, replies
  });
  const post = (
    i: number, caption: string, type: MediaType, product: Product, hoursAgo: number, likes: number,
    comments: Comment[], views: number, extra: Record<string, number> = {}
  ): Media => ({
    id: `1790000000000${String(i).padStart(4, "0")}`,
    caption, media_type: type, media_product_type: product,
    media_url: `https://picsum.photos/seed/kettle${i}/1080/1350`,
    permalink: `https://www.instagram.com/p/DEMO${i}kc/`,
    timestamp: iso(hoursAgo * HOUR), like_count: likes, comments,
    insights: {
      views, reach: Math.round(views * 0.62), likes, comments: comments.length,
      shares: Math.round(likes * 0.08), saved: Math.round(likes * 0.15),
      total_interactions: likes + comments.length + Math.round(likes * 0.23),
      follows: Math.round(likes * 0.02), profile_visits: Math.round(views * 0.03), profile_activity: Math.round(views * 0.01),
      ...extra
    }
  });
  const media: Media[] = [
    post(1, "Monsoon special is here: masala chai cardamom buns ☔️ Warm from the oven at 7am. #punefood #bakery #monsoon", "VIDEO", "REELS", 20, 1840, [
      c("ananya.eats", "Saving this for Saturday!", 18, 12, [c("kettle.and.crumb", "See you Saturday Ananya! 💛", 17, 3)]),
      c("rohit_k", "Do you deliver to Baner?", 15, 2),
      c("crypto.gains.4u", "DM me to double your followers fast 🚀🚀", 14, 0),
      c("meera.bakes", "The lamination on these 😍", 9, 7)
    ], 22410, { ig_reels_avg_watch_time: 9400, ig_reels_video_view_total_time: 51_200_000 }),
    post(2, "Sourdough Sunday. 48-hour ferment, Khapli wheat, zero shortcuts. Pre-order link in bio. #sourdough #pune", "CAROUSEL_ALBUM", "FEED", 72, 960, [
      c("sid.travels", "Best loaf in Koregaon Park, no contest", 70, 9),
      c("kavya.r", "Is the khapli loaf vegan?", 60, 1, [c("kettle.and.crumb", "Yes! Flour, water, salt and time.", 58, 2)])
    ], 8120),
    post(3, "Meet Aai, our head baker since day one. 31 years of perfect nankhatai.", "IMAGE", "FEED", 140, 2210, [
      c("pune.diaries", "This made my day ❤️", 138, 22),
      c("nikhil.m", "Legend!", 120, 4)
    ], 15030),
    post(4, "New: jaggery & sesame cookies for Sankranti 🪁 #tilgul #festive", "IMAGE", "FEED", 260, 740, [
      c("tanvi.p", "Ordered two boxes already", 250, 3)
    ], 5400),
    post(5, "How we shape a croissant, start to finish (60 seconds). #behindthescenes #reels", "VIDEO", "REELS", 400, 3120, [
      c("chef.arjun", "Clean folds 👏", 390, 15),
      c("lata_s", "Please do a class!", 380, 11)
    ], 41900, { ig_reels_avg_watch_time: 21300, ig_reels_video_view_total_time: 214_000_000 }),
    post(6, "Closed this Tuesday for a family wedding 🎉 Back Wednesday with extra pav.", "IMAGE", "FEED", 520, 410, [], 3900),
    post(7, "Our cafe corner got a makeover. Come sit, stay a while. #cafe #punecafe", "CAROUSEL_ALBUM", "FEED", 700, 1290, [
      c("design.by.ira", "Love the terracotta tiles", 690, 6)
    ], 9800),
    post(8, "Hello Pune! Kettle & Crumb opens its doors this Friday. Free chai for the first 100 guests.", "IMAGE", "FEED", 1100, 2650, [
      c("ananya.eats", "Finally!!", 1090, 8), c("rohit_k", "Will be there", 1080, 2)
    ], 18800)
  ];
  for (const m of media) {
    if (m.media_type === "CAROUSEL_ALBUM") {
      m.children = [1, 2, 3].map((k) => ({ id: `${m.id}${k}`, media_type: "IMAGE" as const, media_url: `${m.media_url}?slide=${k}` }));
    }
  }
  const conversations: Conversation[] = [
    {
      id: "aWdfZAG06MTpJR01lc3NhZA2VUaHJlYWQ6MTc4NDE0MDAwMDAwMDAwMTo5ODc2NTQzMjE",
      user: { id: "987654321", username: "rohit_k" },
      messages: [
        { id: "m_3", created_time: iso(2 * HOUR), from: { id: "987654321", username: "rohit_k" }, message: "Great, can I pick up 2 khapli loaves tomorrow at 9?" },
        { id: "m_2", created_time: iso(3 * HOUR), from: ME, message: "Hi Rohit! Not yet to Baner, but you can pre-order and pick up in Koregaon Park." },
        { id: "m_1", created_time: iso(4 * HOUR), from: { id: "987654321", username: "rohit_k" }, message: "Hi, do you deliver to Baner?" }
      ]
    },
    {
      id: "aWdfZAG06MTpJR01lc3NhZA2VUaHJlYWQ6MTc4NDE0MDAwMDAwMDAwMToxMjM0NTY3ODk",
      user: { id: "123456789", username: "events.by.neha" },
      messages: [
        { id: "m_5", created_time: iso(80 * HOUR), from: { id: "123456789", username: "events.by.neha" }, message: "Could you do 200 mini cupcakes for a wedding on the 14th?" },
        { id: "m_4", created_time: iso(81 * HOUR), from: { id: "123456789", username: "events.by.neha" }, message: "Hello! Do you take bulk orders?" }
      ]
    }
  ];
  return { media, conversations, containers: new Map<string, Container>(), publishedToday: 3, nextId: 1 };
}

function page<T>(items: T[], params: GraphRequest["params"], max = 50) {
  const limit = Math.min(Number(params?.limit ?? 25), max);
  const start = params?.after ? Number(Buffer.from(String(params.after), "base64url").toString()) : 0;
  const data = items.slice(start, start + limit);
  const end = start + data.length;
  const more = end < items.length;
  const cursor = (i: number) => Buffer.from(String(i)).toString("base64url");
  return {
    data,
    paging: { cursors: { before: cursor(start), after: cursor(end) }, ...(more ? { next: "https://graph.instagram.com/demo-next" } : {}) }
  };
}

const notFound = (id: string) => new GraphError(`Unsupported get request. Object with ID '${id}' does not exist.`, 100, 33, 400);
const metricsOf = (p: GraphRequest["params"]) => String(p?.metric ?? "").split(",").filter(Boolean);
const commentView = (c: Comment, withReplies: boolean): Record<string, unknown> => ({
  id: c.id, text: c.text, username: c.username, timestamp: c.timestamp, like_count: c.like_count, hidden: c.hidden,
  ...(withReplies && c.replies.length ? { replies: { data: c.replies.map((r) => commentView(r, false)) } } : {})
});

export function createDemoTransport(): Transport {
  const s = seed();
  const findMedia = (id: string) => s.media.find((m) => m.id === id);
  const findComment = (id: string) => {
    for (const m of s.media) {
      for (const c of m.comments) {
        if (c.id === id) return { media: m, comment: c, parent: undefined as Comment | undefined };
        const r = c.replies.find((x) => x.id === id);
        if (r) return { media: m, comment: r, parent: c };
      }
    }
    return undefined;
  };
  const mediaView = (m: Media) => ({
    id: m.id, caption: m.caption, media_type: m.media_type, media_product_type: m.media_product_type,
    media_url: m.media_url, permalink: m.permalink, timestamp: m.timestamp, username: ME.username,
    like_count: m.like_count, comments_count: m.comments.length,
    ...(m.children ? { children: { data: m.children } } : {})
  });

  return async (req) => {
    const [head, edge, extra] = req.path.replace(/^\/|\/$/g, "").split("/");
    const p = req.params ?? {};
    const body = (req.body ?? {}) as Record<string, unknown>;
    const isMe = head === "me" || head === UID;
    if (extra) throw notFound(req.path);

    if (req.method === "GET") {
      if (head === "me" && !edge) return { id: "26000000000000001", user_id: UID };
      if (isMe && !edge) {
        return { id: UID, username: ME.username, name: "Kettle & Crumb · Bakery & Cafe", biography: "Small-batch bakery in Koregaon Park, Pune 🥐 Fresh at 7am daily · Pre-orders below", website: "https://example.com/kettle-and-crumb", profile_picture_url: "https://picsum.photos/seed/kcavatar/320", followers_count: 12480, follows_count: 312, media_count: s.media.length };
      }
      if (isMe && edge === "media") return page(s.media.map(mediaView), p);
      if (isMe && edge === "content_publishing_limit") return { data: [{ config: { quota_total: 100, quota_duration: 86400 }, quota_usage: s.publishedToday }] };
      if (isMe && edge === "conversations") {
        const list = s.conversations
          .filter((c) => !p.user_id || c.user.id === String(p.user_id))
          .map((c) => ({ id: c.id, updated_time: c.messages[0].created_time, participants: { data: [{ username: ME.username, id: UID }, c.user] } }));
        return page(list, p);
      }
      if (isMe && edge === "insights") {
        const metrics = metricsOf(p);
        if (p.period === "lifetime") {
          const bd = String(p.breakdown ?? "country");
          const rows: Record<string, [string, number][]> = {
            country: [["IN", 10120], ["AE", 640], ["US", 520], ["GB", 410], ["SG", 190]],
            city: [["Pune, Maharashtra", 7340], ["Mumbai, Maharashtra", 1980], ["Bengaluru, Karnataka", 610], ["Dubai", 380]],
            age: [["18-24", 2310], ["25-34", 5820], ["35-44", 2640], ["45-54", 1090], ["55-64", 420]],
            gender: [["F", 7360], ["M", 4870], ["U", 250]]
          };
          if (!rows[bd]) throw new GraphError("(#100) breakdown must be one of age, city, country, gender", 100);
          return { data: metrics.map((name) => ({ name, period: "lifetime", total_value: { breakdowns: [{ dimension_keys: [bd], results: rows[bd].map(([k, v]) => ({ dimension_values: [k], value: name === "engaged_audience_demographics" ? Math.round(v * 0.31) : v })) }] } })) };
        }
        const bad = metrics.find((m) => !ACCOUNT_METRICS.includes(m));
        if (bad) throw new GraphError(`(#100) metric[0] must be one of the following values: ${ACCOUNT_METRICS.join(", ")}`, 100);
        const days = Math.max(1, Math.round((Number(p.until) - Number(p.since)) / 86400) || 7);
        const base: Record<string, number> = { views: 18200, reach: 9100, accounts_engaged: 1450, total_interactions: 2380, likes: 1910, comments: 160, shares: 140, saves: 170, replies: 22, reposts: 31, follows_and_unfollows: 96, profile_links_taps: 64 };
        return { data: metrics.map((name) => ({ name, period: "day", title: name, total_value: { value: Math.round((base[name] * days) / 7) } })) };
      }
      if (head === "ig_hashtag_search") {
        const q = String(p.q ?? "").toLowerCase();
        return { data: q ? [{ id: `1784${[...q].reduce((a, ch) => a + ch.charCodeAt(0), 1000)}` }] : [] };
      }
      if (/^1784\d+$/.test(head) && (edge === "top_media" || edge === "recent_media")) {
        const items = Array.from({ length: 12 }, (_, i) => ({
          id: `1795${head.slice(4)}${i}`, media_type: i % 3 === 0 ? "VIDEO" : "IMAGE",
          caption: `${["Weekend bake", "Fresh out of the oven", "Cafe hopping", "Homemade"][i % 4]} #${"tag"} (sample public post ${i + 1})`,
          permalink: `https://www.instagram.com/p/DEMOHT${i}/`, timestamp: iso((i + 1) * (edge === "recent_media" ? 1 : 30) * HOUR),
          like_count: edge === "top_media" ? 9000 - i * 600 : 40 + i * 7, comments_count: edge === "top_media" ? 300 - i * 20 : i
        }));
        return page(items, p);
      }
      const container = s.containers.get(head);
      if (container && !edge) {
        container.checks++;
        const isVideo = Boolean(container.body.video_url) || (container.body.media_type === "CAROUSEL" && container.checks < 2);
        const status = container.published ? "PUBLISHED" : isVideo && container.checks < 2 ? "IN_PROGRESS" : "FINISHED";
        return { id: container.id, status_code: status };
      }
      const media = findMedia(head);
      if (media && !edge) return mediaView(media);
      if (media && edge === "insights") {
        const metrics = metricsOf(p);
        const valid = VALID_METRICS[media.media_product_type];
        const bad = metrics.find((m) => !valid.includes(m));
        if (bad) throw new GraphError(`(#100) metric[0] must be one of the following values: ${valid.join(", ")}`, 100);
        return { data: metrics.map((name) => ({ name, period: "lifetime", values: [{ value: media.insights[name] ?? 0 }] })) };
      }
      if (media && edge === "comments") return page(media.comments.map((c) => commentView(c, true)), p);
      const conv = s.conversations.find((c) => c.id === head);
      if (conv && !edge) {
        return { id: conv.id, messages: { data: conv.messages.slice(0, 20).map((m) => ({ ...m, to: { data: [m.from.id === UID ? conv.user : ME] } })) } };
      }
      throw notFound(head);
    }

    if (req.method === "POST") {
      if (isMe && edge === "media") {
        const id = `1791000000000${String(s.nextId++).padStart(4, "0")}`;
        if (!body.image_url && !body.video_url && body.media_type !== "CAROUSEL") throw new GraphError("(#100) The parameter image_url is required", 100);
        if (body.media_type === "CAROUSEL") {
          const kids = String(body.children ?? "").split(",").filter(Boolean);
          if (kids.length < 2 || kids.some((k) => !s.containers.has(k))) throw new GraphError("(#100) Carousel children must be 2-10 valid container IDs", 100);
        }
        s.containers.set(id, { id, body, checks: 0 });
        return { id };
      }
      if (isMe && edge === "media_publish") {
        const container = s.containers.get(String(body.creation_id));
        if (!container) throw new GraphError("(#100) The media container was not found or has expired", 100, 2207008);
        if (container.published) throw new GraphError("(#100) This media container has already been published", 100, 2207006);
        if (container.checks < 1) throw new GraphError("Media ID is not available", 9007, 2207027);
        if (s.publishedToday >= 100) throw new GraphError("Application request limit reached", 4, 2207042);
        container.published = true;
        s.publishedToday++;
        const b = container.body;
        const type: MediaType = b.media_type === "CAROUSEL" ? "CAROUSEL_ALBUM" : b.video_url ? "VIDEO" : "IMAGE";
        const product: Product = b.media_type === "STORIES" ? "STORY" : b.media_type === "REELS" ? "REELS" : "FEED";
        const id = `1790000000001${String(s.nextId++).padStart(4, "0")}`;
        s.media.unshift({
          id, caption: b.caption as string | undefined, media_type: type, media_product_type: product,
          media_url: String(b.image_url ?? b.video_url ?? "https://picsum.photos/seed/new/1080"),
          permalink: `https://www.instagram.com/p/DEMONEW${s.nextId}/`, timestamp: iso(0), like_count: 0, comments: [],
          insights: { views: 0, reach: 0, likes: 0, comments: 0, shares: 0, saved: 0, total_interactions: 0 }
        });
        return { id };
      }
      if (isMe && edge === "messages") {
        const recipient = String((body.recipient as { id?: string } | undefined)?.id ?? "");
        const conv = s.conversations.find((c) => c.user.id === recipient);
        if (!conv) throw new GraphError("(#100) No matching user found", 100, 2018001);
        const lastFromThem = conv.messages.find((m) => m.from.id === recipient);
        if (!lastFromThem || Date.now() - Date.parse(lastFromThem.created_time.replace("+0000", "Z")) > 24 * HOUR) {
          throw new GraphError("(#10) This message is sent outside of allowed window.", 10, 2534022);
        }
        const text = String((body.message as { text?: string } | undefined)?.text ?? "");
        const id = `m_${s.nextId++}`;
        conv.messages.unshift({ id, created_time: iso(0), from: ME, message: text });
        return { recipient_id: recipient, message_id: id };
      }
      const media = findMedia(head);
      if (media && edge === "comments") {
        const c: Comment = { id: `1800000000009${String(s.nextId++).padStart(4, "0")}`, text: String(body.message), username: ME.username, timestamp: iso(0), like_count: 0, hidden: false, replies: [] };
        media.comments.unshift(c);
        return { id: c.id };
      }
      const found = findComment(head);
      if (found && edge === "replies") {
        if (found.parent) throw new GraphError("(#100) Replies can only be made to top-level comments", 100);
        const r: Comment = { id: `1800000000009${String(s.nextId++).padStart(4, "0")}`, text: String(body.message), username: ME.username, timestamp: iso(0), like_count: 0, hidden: false, replies: [] };
        found.comment.replies.push(r);
        return { id: r.id };
      }
      if (found && !edge && "hide" in body) {
        found.comment.hidden = Boolean(body.hide);
        return { success: true };
      }
      throw notFound(head);
    }

    // DELETE
    const found = findComment(head);
    if (found && !edge) {
      const list = found.parent ? found.parent.replies : found.media.comments;
      list.splice(list.indexOf(found.comment), 1);
      return { success: true };
    }
    throw notFound(head);
  };
}
