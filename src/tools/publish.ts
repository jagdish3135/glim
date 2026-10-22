import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { respond, short, text } from "../format.js";
import type { Graph } from "../graph.js";
import { captionProblems, mediaUrlProblem } from "../validate.js";
import { READ, idArg } from "./account.js";

type Kind = "image" | "video";
const guessKind = (url: string): Kind => (/\.(mp4|mov|m4v)(\?|#|$)/i.test(url) ? "video" : "image");
const urlArg = z.string().min(8).max(2000);
const kindArg = z.enum(["image", "video"]).optional().describe("Override the image/video guess made from the file extension");

/** Waits for a container to finish processing. Videos can take a while; stops early on cancel or timeout. */
export async function waitForContainer(graph: Graph, id: string, signal: AbortSignal, maxMs = 50_000): Promise<string> {
  const start = Date.now();
  for (;;) {
    const { status_code } = await graph.get<{ status_code: string }>(id, { fields: "status_code" }, signal);
    if (status_code !== "IN_PROGRESS" || Date.now() - start + graph.pollMs > maxMs) return status_code;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, graph.pollMs);
      signal.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
    });
  }
}

function mediaFields(url: string, kind: Kind, asReel: boolean): Record<string, unknown> {
  return kind === "video" ? { media_type: asReel ? "REELS" : "VIDEO", video_url: url } : { image_url: url };
}

export function registerPublishTools(server: McpServer, graph: Graph) {
  server.registerTool(
    "ig_prepare_post",
    {
      title: "Prepare a post (step 1 of 2)",
      description: `Step 1 of publishing: upload media to Instagram as an unpublished draft and return a preview with a container_id. Nothing is public yet.
Show the preview to the user and get a clear yes, then call ig_publish_post with the container_id. Drafts expire after 24 hours.
Media must be at a public https:// URL (Instagram downloads it). Photos must be JPEG. Reels: MP4/MOV, 3 s to 15 min.
Types: 'image' (one photo), 'carousel' (2-10 photos/videos), 'reel' (one video), 'story' (one photo or video, no caption).
Example: "Post this photo with caption X" -> type='image', media_url='https://.../photo.jpg', caption='X'.`,
      inputSchema: z.strictObject({
        type: z.enum(["image", "carousel", "reel", "story"]),
        media_url: urlArg.optional().describe("Public https URL of the photo or video (image, reel, story)"),
        media_kind: kindArg,
        items: z.array(z.strictObject({ url: urlArg, kind: kindArg })).min(2).max(10).optional().describe("Carousel slides in order, 2-10"),
        caption: z.string().max(5000).optional().describe("Caption with hashtags/mentions; max 2200 chars, 30 hashtags, 20 mentions"),
        alt_text: z.string().max(1000).optional().describe("Accessibility description (single photo posts)"),
        cover_url: urlArg.optional().describe("Reel cover image URL"),
        share_to_feed: z.boolean().default(true).describe("Reels: also show on the profile grid")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async (a, ctx) => {
      const signal = ctx.mcpReq.signal;
      const problems: string[] = [];
      if (a.type === "carousel" ? !a.items : !a.media_url) {
        problems.push(a.type === "carousel" ? "A carousel needs 'items' (2-10 slides)." : `A ${a.type} needs 'media_url'.`);
      }
      if (a.type !== "carousel" && a.items) problems.push("'items' is only for carousels; use 'media_url'.");
      if (a.type === "story" && a.caption) problems.push("Stories can't have captions on Instagram's API. Remove 'caption'.");
      if (a.caption) problems.push(...captionProblems(a.caption));
      const urls = [a.media_url, a.cover_url, ...(a.items ?? []).map((i) => i.url)].filter((u): u is string => Boolean(u));
      for (const u of urls) {
        const p = mediaUrlProblem(u);
        if (p) problems.push(p);
      }
      const kind = a.media_url ? a.media_kind ?? guessKind(a.media_url) : "image";
      if (a.type === "reel" && kind !== "video") problems.push("A reel needs a video (MP4/MOV). For a photo use type 'image'.");
      if (a.type === "image" && kind !== "image") problems.push("type 'image' needs a photo. For a video use type 'reel'.");
      if (problems.length) throw new Error(`Nothing was uploaded:\n- ${problems.join("\n- ")}`);

      const id = await graph.userId(signal);
      const caption = a.caption?.trim() || undefined;
      let body: Record<string, unknown>;
      if (a.type === "carousel") {
        const children: string[] = [];
        for (const item of a.items!) {
          const k = item.kind ?? guessKind(item.url);
          const child = await graph.post<{ id: string }>(`${id}/media`, { is_carousel_item: true, ...mediaFields(item.url, k, false) }, signal);
          if (k === "video") {
            const status = await waitForContainer(graph, child.id, signal);
            if (status !== "FINISHED") throw new Error(`Carousel video ${item.url} didn't finish processing (status ${status}). Check the file and try again.`);
          }
          children.push(child.id);
        }
        body = { media_type: "CAROUSEL", children: children.join(","), caption };
      } else if (a.type === "story") {
        body = { ...mediaFields(a.media_url!, kind, false), media_type: "STORIES" };
      } else if (a.type === "reel") {
        body = { ...mediaFields(a.media_url!, "video", true), caption, cover_url: a.cover_url, share_to_feed: a.share_to_feed };
      } else {
        body = { image_url: a.media_url, caption, alt_text: a.alt_text };
      }
      const container = await graph.post<{ id: string }>(`${id}/media`, body, signal);
      const status = await waitForContainer(graph, container.id, signal);
      if (status === "ERROR" || status === "EXPIRED") {
        throw new Error(`Instagram couldn't process the media (status ${status}). Check the file format (JPEG photos; MP4/MOV video, H.264, AAC) and that the URL is public.`);
      }
      const data = { container_id: container.id, status, type: a.type, caption: caption ?? null, media: a.items?.map((i) => i.url) ?? [a.media_url] };
      return respond("markdown", data, () =>
        [
          `# Draft ready (not public yet)`,
          `- Type: ${a.type}${a.items ? ` with ${a.items.length} slides` : ""}`,
          `- Media: ${data.media.join(", ")}`,
          `- Caption: ${caption ? short(caption, 300) : "(none)"}`,
          `- container_id: ${container.id}`,
          `- Status: ${status === "FINISHED" ? "ready to publish" : "still processing; publishing will work in a minute or two"}`,
          "",
          "Show this preview to the user. After they confirm, call ig_publish_post with this container_id. The draft expires in 24 hours."
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "ig_publish_post",
    {
      title: "Publish a prepared post (step 2 of 2)",
      description: `Step 2 of publishing: make a draft from ig_prepare_post public on the account. This can't be undone through the API.
Only call after the user has seen the ig_prepare_post preview and confirmed. Returns the new post's ID and link.`,
      inputSchema: z.strictObject({ container_id: idArg("container").describe("container_id from ig_prepare_post") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ container_id }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const { status_code } = await graph.get<{ status_code: string }>(container_id, { fields: "status_code" }, signal);
      if (status_code === "PUBLISHED") throw new Error("This draft is already published. Use ig_list_media to find the post.");
      if (status_code === "IN_PROGRESS") throw new Error("The media is still processing. Wait a minute and call ig_publish_post again.");
      if (status_code !== "FINISHED") throw new Error(`This draft can't be published (status ${status_code}). Drafts expire after 24 hours; prepare it again with ig_prepare_post.`);
      const id = await graph.userId(signal);
      const posted = await graph.post<{ id: string }>(`${id}/media_publish`, { creation_id: container_id }, signal);
      const m = await graph.get<{ permalink?: string }>(posted.id, { fields: "permalink" }, signal).catch(() => ({ permalink: undefined }));
      return text(`Published. Post ID ${posted.id}${m.permalink ? ` · ${m.permalink}` : ""}`);
    }
  );

  server.registerTool(
    "ig_get_publishing_limit",
    {
      title: "Publishing quota",
      description: "How many posts the account has published through the API in the last 24 hours, and the limit (usually 100; carousels count as one).",
      inputSchema: z.strictObject({}),
      annotations: READ
    },
    async (_a, ctx) => {
      const signal = ctx.mcpReq.signal;
      const id = await graph.userId(signal);
      const res = await graph.get<{ data: { quota_usage: number; config?: { quota_total: number } }[] }>(
        `${id}/content_publishing_limit`,
        { fields: "quota_usage,config" },
        signal
      );
      const used = res.data[0]?.quota_usage ?? 0;
      const total = res.data[0]?.config?.quota_total ?? 100;
      return text(`Published ${used} of ${total} allowed posts in the last 24 hours (${total - used} left).`);
    }
  );
}
