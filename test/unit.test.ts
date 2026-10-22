import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { explainGraphError, Graph, GraphError, liveTransport } from "../src/graph.js";
import { captionProblems, dmProblem, mediaUrlProblem } from "../src/validate.js";

describe("caption limits", () => {
  it("accepts a normal caption", () => {
    expect(captionProblems("Fresh buns at 7am #bakery @friend")).toEqual([]);
  });
  it("flags long captions, too many hashtags and mentions", () => {
    expect(captionProblems("a".repeat(2201))[0]).toMatch(/2201 characters/);
    expect(captionProblems(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "))[0]).toMatch(/31 hashtags/);
    expect(captionProblems(Array.from({ length: 21 }, (_, i) => `@u${i}`).join(" "))[0]).toMatch(/21 @mentions/);
  });
  it("counts non-English hashtags", () => {
    expect(captionProblems(Array.from({ length: 31 }, (_, i) => `#पुणे${i}`).join(" "))).toHaveLength(1);
  });
});

describe("media URLs", () => {
  it("allows public https", () => expect(mediaUrlProblem("https://cdn.example.com/a.jpg")).toBeUndefined());
  it.each(["http://example.com/a.jpg", "not a url", "https://localhost/a.jpg", "https://192.168.1.4/a.jpg", "https://10.0.0.1/x.mp4", "https://[::1]/a.jpg"])(
    "rejects %s",
    (u) => expect(mediaUrlProblem(u)).toBeTruthy()
  );
});

describe("DM text", () => {
  it("measures bytes, not characters", () => {
    expect(dmProblem("नमस्ते".repeat(60))).toMatch(/bytes/); // 60 × 18 bytes > 1000
    expect(dmProblem("hello")).toBeUndefined();
    expect(dmProblem("   ")).toMatch(/empty/);
  });
});

describe("config", () => {
  it("runs demo mode without a token", () => expect(loadConfig({}).loginType).toBe("demo"));
  it("picks the host from the token type", () => {
    expect(loadConfig({ INSTAGRAM_ACCESS_TOKEN: "IGAAxyz" }).baseUrl).toBe("https://graph.instagram.com/v26.0");
    expect(loadConfig({ INSTAGRAM_ACCESS_TOKEN: "EAAxyz", INSTAGRAM_API_VERSION: "25.0" }).baseUrl).toBe("https://graph.facebook.com/v25.0");
  });
  it("rejects a malformed version", () => expect(() => loadConfig({ INSTAGRAM_API_VERSION: "latest" })).toThrow(/v26.0/));
});

describe("Graph error explanations", () => {
  it.each([
    [190, undefined, /expired/],
    [10, 2534022, /24 hours/],
    [4, undefined, /rate limit/i],
    [200, undefined, /Permission denied/],
    [100, 2207042, /publishing limit/],
    [9007, 2207027, /still processing/]
  ])("code %s/%s", (code, sub, re) => {
    expect(explainGraphError(new GraphError("x", code, sub))).toMatch(re);
  });
});

describe("live transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the token as a header, never in the URL, and redacts it from errors", async () => {
    const token = "IGAAsecret123";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: `Bad token IGAAsecret123`, code: 190 } }), { status: 400 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const graph = new Graph("instagram", liveTransport(loadConfig({ INSTAGRAM_ACCESS_TOKEN: token })));
    const err = await graph.get("me", { fields: "user_id" }).catch((e: Error) => e);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://graph.instagram.com/v26.0/me?fields=user_id");
    expect(String(url)).not.toContain(token);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    expect((err as Error).message).toMatch(/expired/);
    expect((err as Error).message).not.toContain(token);
  });

  it("finds the Instagram account behind a Facebook Page token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{}, { instagram_business_account: { id: "1784999" } }] })));
    const graph = new Graph("facebook", liveTransport(loadConfig({ INSTAGRAM_ACCESS_TOKEN: "EAAx" })));
    expect(await graph.userId()).toBe("1784999");
  });

  it("explains network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const graph = new Graph("instagram", liveTransport(loadConfig({ INSTAGRAM_ACCESS_TOKEN: "IGx" })));
    await expect(graph.get("me")).rejects.toThrow(/Couldn't reach/);
  });
});
