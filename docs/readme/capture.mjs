// Captures README media: landing page screenshots (light, dark, phone), the hero chat demo as
// MP4 + animated WebP + GIF, and a card of real tool output from demo mode.
// Usage: npm run build && node docs/readme/capture.mjs [baseUrl]   (needs the site served, and ffmpeg on PATH)
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createDemoTransport } from "../../dist/demo.js";
import { Graph } from "../../dist/graph.js";
import { createServer } from "../../dist/server.js";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] ?? "http://localhost:5190").replace(/\/$/, "");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
const browser = await chromium.launch();

async function shot(theme, file, { size = { width: 1280, height: 800 }, scrollTo, fullPage = false } = {}) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => localStorage.setItem("glim-theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(() => document.fonts.ready);
  if (scrollTo) await page.locator(scrollTo).scrollIntoViewIfNeeded();
  await wait(500);
  await page.screenshot({ path: join(here, file), type: "jpeg", quality: 86, fullPage });
  await ctx.close();
}

await shot("light", "landing-light.jpg");
await shot("dark", "landing-dark.jpg");
await shot("light", "tools-light.jpg", { scrollTo: "#tools h2" });
await shot("light", "phone.jpg", { size: { width: 390, height: 844 } });
console.log("Screenshots done");

// Hero chat demo video
{
  const size = { width: 1280, height: 840 };
  const tmp = mkdtempSync(join(tmpdir(), "glim-rec-"));
  const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: tmp, size }, colorScheme: "light", reducedMotion: "no-preference" });
  await ctx.addInitScript(() => localStorage.setItem("glim-theme", "light"));
  const page = await ctx.newPage();
  await page.goto(BASE);
  await wait(13_500);
  await ctx.close();
  const webm = join(tmp, readdirSync(tmp).find((f) => f.endsWith(".webm")));
  const out = (ext) => join(here, `demo.${ext}`);
  ffmpeg("-ss", "1", "-i", webm, "-t", "12", "-vf", "fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-movflags", "+faststart", out("mp4"));
  ffmpeg("-i", out("mp4"), "-vf", "fps=12,scale=960:-2:flags=lanczos", "-c:v", "libwebp_anim", "-loop", "0", "-q:v", "70", "-an", out("webp"));
  ffmpeg("-i", out("mp4"), "-vf", "fps=8,scale=720:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "-loop", "0", out("gif"));
  rmSync(tmp, { recursive: true, force: true });
  console.log("Demo video done");
}

// Real tool output from demo mode, rendered as a terminal card
{
  const graph = new Graph("demo", createDemoTransport(), undefined, 1);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(graph).connect(a);
  const client = new Client({ name: "readme", version: "1.0.0" });
  await client.connect(b);
  const calls = [
    ["ig_get_profile", {}],
    ["ig_get_media_insights", { media_id: "17900000000000001" }],
    ["ig_prepare_post", { type: "image", media_url: "https://cdn.example.com/sourdough.jpg", caption: "Sourdough Sunday 🥖 #pune" }]
  ];
  const blocks = [];
  for (const [name, args] of calls) {
    const r = await client.callTool({ name, arguments: args });
    blocks.push({ name, args, text: r.content.map((c) => c.text).join("\n") });
  }
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<html><head><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;background:#15130f;padding:28px;font:14px/1.6 'JetBrains Mono',monospace;color:#f1eadc;width:820px">
<div id="card" style="background:#1e1b16;border:1px solid #3a342b;border-radius:16px;padding:22px 26px">
<div style="color:#b3a893;margin-bottom:14px">glim-mcp · demo mode · real output</div>
${blocks.map((b) => `<div style="color:#ff936f;font-weight:600;word-break:break-all">→ ${b.name}(${esc(JSON.stringify(b.args))})</div><pre style="margin:6px 0 20px;white-space:pre-wrap;font:inherit">${esc(b.text)}</pre>`).join("")}
</div></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 880, height: 600 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.locator("#card").screenshot({ path: join(here, "tool-output.jpg"), type: "jpeg", quality: 88 });
  await client.close();
  console.log("Tool output card done");
}

await browser.close();
