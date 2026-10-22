import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import type { LoginType } from "../src/config.js";
import { createDemoTransport } from "../src/demo.js";
import { Graph } from "../src/graph.js";
import { createServer } from "../src/server.js";

/** A client wired to a fresh demo account, through the real MCP protocol. */
async function connect(loginType: LoginType = "demo") {
  const graph = new Graph(loginType, createDemoTransport(), undefined, 1);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(graph).connect(a);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
    return { error: Boolean(r.isError), text, data: r.structuredContent as Record<string, any> | undefined };
  };
  return { client, call };
}

describe("tool list", () => {
  it("exposes 17 tools, each with annotations", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(17);
    for (const t of tools) expect(t.annotations, t.name).toBeDefined();
    expect(tools.find((t) => t.name === "ig_delete_comment")?.annotations?.destructiveHint).toBe(true);
  });
});

describe("profile and media", () => {
  it("shows the demo account and says it's demo mode", async () => {
    const { call } = await connect();
    const r = await call("ig_get_profile");
    expect(r.text).toContain("@kettle.and.crumb");
    expect(r.text).toMatch(/demo/);
  });

  it("pages through media with a cursor", async () => {
    const { call } = await connect();
    const first = await call("ig_list_media", { limit: 5, response_format: "json" });
    expect(first.data!.count).toBe(5);
    expect(first.data!.after).toBeTruthy();
    const second = await call("ig_list_media", { limit: 5, after: first.data!.after, response_format: "json" });
    expect(second.data!.count).toBe(3);
    expect(second.data!.has_more).toBe(false);
  });

  it("returns a readable error for an unknown post", async () => {
    const { call } = await connect();
    const r = await call("ig_get_media", { media_id: "123456" });
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/does not exist/);
  });
});

describe("insights", () => {
  it("picks reel metrics automatically and formats watch time", async () => {
    const { call } = await connect();
    const r = await call("ig_get_media_insights", { media_id: "17900000000000001" });
    expect(r.text).toMatch(/avg watch time: 9\.4 s/);
  });
  it("lists valid metrics when one is wrong", async () => {
    const { call } = await connect();
    const r = await call("ig_get_media_insights", { media_id: "17900000000000003", metrics: ["impressions"] });
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/Default metrics for a Photo/);
  });
  it("totals account metrics and audience", async () => {
    const { call } = await connect();
    const acc = await call("ig_get_account_insights", { days: 7, response_format: "json" });
    expect(acc.data!.totals.views).toBe(18200);
    const aud = await call("ig_get_audience", { breakdown: "city" });
    expect(aud.text).toMatch(/Pune, Maharashtra/);
  });
});

describe("two-step publishing", () => {
  it("prepares a draft, then publishes it once", async () => {
    const { call } = await connect();
    const prep = await call("ig_prepare_post", { type: "image", media_url: "https://cdn.example.com/bun.jpg", caption: "New bun #bakery" });
    expect(prep.error).toBe(false);
    expect(prep.text).toMatch(/not public yet/);
    const container = prep.text.match(/container_id: (\d+)/)![1];

    const before = await call("ig_list_media", { limit: 1, response_format: "json" });
    expect(before.data!.media[0].caption).not.toBe("New bun #bakery"); // nothing public after step 1

    const pub = await call("ig_publish_post", { container_id: container });
    expect(pub.text).toMatch(/Published/);
    const after = await call("ig_list_media", { limit: 1, response_format: "json" });
    expect(after.data!.media[0].caption).toBe("New bun #bakery");

    const again = await call("ig_publish_post", { container_id: container });
    expect(again.error).toBe(true);
    expect(again.text).toMatch(/already published/);
  });

  it("waits for a reel and builds a carousel", async () => {
    const { call } = await connect();
    const reel = await call("ig_prepare_post", { type: "reel", media_url: "https://cdn.example.com/clip.mp4", caption: "Folding" });
    expect(reel.text).toMatch(/ready to publish/);
    const carousel = await call("ig_prepare_post", { type: "carousel", items: [{ url: "https://cdn.example.com/1.jpg" }, { url: "https://cdn.example.com/2.mp4" }] });
    expect(carousel.error).toBe(false);
    expect(carousel.text).toMatch(/2 slides/);
  });

  it.each([
    [{ type: "story", media_url: "https://cdn.example.com/s.jpg", caption: "hi" }, /Stories can't have captions/],
    [{ type: "image", media_url: "http://cdn.example.com/a.jpg" }, /https/],
    [{ type: "reel", media_url: "https://cdn.example.com/a.jpg" }, /needs a video/],
    [{ type: "carousel" }, /needs 'items'/],
    [{ type: "image", media_url: "https://cdn.example.com/a.jpg", caption: "x".repeat(2300) }, /2300 characters/]
  ])("rejects bad input before uploading: %o", async (args, re) => {
    const { call } = await connect();
    const r = await call("ig_prepare_post", args);
    expect(r.error).toBe(true);
    expect(r.text).toMatch(re);
    expect(r.text).toMatch(/Nothing was uploaded/);
  });
});

describe("comments", () => {
  it("replies, hides and deletes", async () => {
    const { call } = await connect();
    const list = await call("ig_list_comments", { media_id: "17900000000000001", response_format: "json" });
    const spam = list.data!.comments.find((c: any) => c.username === "crypto.gains.4u");
    const fan = list.data!.comments.find((c: any) => c.username === "rohit_k");

    expect((await call("ig_reply_to_comment", { comment_id: fan.id, message: "Not yet, sorry!" })).text).toMatch(/Posted reply/);
    expect((await call("ig_hide_comment", { comment_id: spam.id })).text).toMatch(/hidden/);
    expect((await call("ig_delete_comment", { comment_id: spam.id })).text).toMatch(/Deleted/);

    const after = await call("ig_list_comments", { media_id: "17900000000000001", response_format: "json" });
    expect(after.data!.comments.some((c: any) => c.id === spam.id)).toBe(false);
    expect(after.data!.comments.find((c: any) => c.id === fan.id).replies.data[0].text).toBe("Not yet, sorry!");
  });
  it("needs exactly one target for a reply", async () => {
    const { call } = await connect();
    expect((await call("ig_reply_to_comment", { message: "hi" })).text).toMatch(/exactly one/);
  });
});

describe("DMs", () => {
  it("reads, replies inside the 24h window and explains outside it", async () => {
    const { call } = await connect();
    const convs = await call("ig_list_conversations", { response_format: "json" });
    const [recent, old] = convs.data!.conversations;
    const msgs = await call("ig_get_messages", { conversation_id: recent.conversation_id });
    expect(msgs.text).toMatch(/You can reply/);
    expect((await call("ig_send_message", { recipient_id: recent.with_id, text: "See you at 9!" })).text).toMatch(/Sent/);

    const late = await call("ig_send_message", { recipient_id: old.with_id, text: "Sorry for the delay" });
    expect(late.error).toBe(true);
    expect(late.text).toMatch(/24 hours/);
  });
  it("explains that Facebook-login tokens can't use DMs", async () => {
    const { call } = await connect("facebook");
    expect((await call("ig_list_conversations")).text).toMatch(/Instagram Login tokens/);
  });
});

describe("hashtags", () => {
  it("finds top posts in demo mode", async () => {
    const { call } = await connect();
    const r = await call("ig_search_hashtag", { hashtag: "#punefood", limit: 3, response_format: "json" });
    expect(r.data!.posts).toHaveLength(3);
  });
  it("explains the Facebook Login requirement for Instagram-login tokens", async () => {
    const { call } = await connect("instagram");
    const r = await call("ig_search_hashtag", { hashtag: "punefood" });
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/Facebook Login/);
  });
});
