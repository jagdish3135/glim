// Writes the README banner and "how it works" diagram in night (dark) and day (light) versions.
// Fonts are subset from Google Fonts and embedded, so the SVGs look right on GitHub.
// Usage: node docs/readme/make-svgs.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function font(family, weight, text) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
  const src = css.match(/url\((https:[^)]+)\)/)?.[1];
  if (!src) throw new Error(`No font file for ${family}`);
  const b64 = Buffer.from(await (await fetch(src)).arrayBuffer()).toString("base64");
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}

const ASCII = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,·'-–()?:/+&_>▸→←⟷%#@";
const FONTS = [
  await font("Big Shoulders Display", 900, ASCII),
  await font("Chakra Petch", 500, ASCII),
  await font("Martian Mono", 400, ASCII)
].join("");
const D = `font-family="'Big Shoulders Display', Impact, sans-serif" font-weight="900"`;
const B = `font-family="'Chakra Petch', 'Segoe UI', sans-serif" font-weight="500"`;
const M = `font-family="'Martian Mono', Consolas, monospace"`;

const themes = {
  dark: { bg: "#07080d", panel: "#0d0f18", ink: "#e6ebf5", muted: "#9aa3b8", line: "#262b3d", acid: "#e8ff2a", cyan: "#2ee6ff", pink: "#ff3d8f", onAcid: "#07080d", grid: "rgba(46,230,255,.28)", glow: true },
  light: { bg: "#e7e9e1", panel: "#f6f7f1", ink: "#0a0b10", muted: "#3d4254", line: "#0a0b10", acid: "#e8ff2a", cyan: "#00697d", pink: "#b8005a", onAcid: "#0a0b10", grid: "rgba(10,11,16,.18)", glow: false }
};
const cut = (x, y, w, h, c = 14) => `${x},${y} ${x + w - c},${y} ${x + w},${y + c} ${x + w},${y + h} ${x + c},${y + h} ${x},${y + h - c}`;
const sparkle = (x, y, s, fill) => `<path transform="translate(${x} ${y}) scale(${s})" d="M16 2c1.3 7.6 6.3 12.7 14 14-7.7 1.3-12.7 6.4-14 14-1.3-7.6-6.3-12.7-14-14 7.7-1.3 12.7-6.4 14-14z" fill="${fill}"/>`;

function floor(c, w, top, h) {
  // A perspective grid: horizontal lines bunch up toward the horizon, verticals fan out from a vanishing point
  const vx = w * 0.62;
  const lines = [];
  for (let i = 1; i <= 9; i++) {
    const y = top + h * (i / 9) ** 1.8;
    lines.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${w}" y2="${y.toFixed(1)}"/>`);
  }
  for (let i = -14; i <= 14; i++) lines.push(`<line x1="${vx}" y1="${top}" x2="${vx + i * 140}" y2="${top + h}"/>`);
  return `<g stroke="${c.grid}" stroke-width="1">${lines.join("")}</g>`;
}

function banner(c) {
  const tags = [["READ", c.cyan], ["WRITE", c.acid], ["DESTROY", c.pink]];
  const rows = [
    ["READ", "ig_get_media_insights", "22.4k views · 9.4 s watch"],
    ["WRITE", "ig_prepare_post", "Draft ready, not public yet"],
    ["WRITE", "ig_hide_comment", "1 spam comment hidden"],
    ["WRITE", "ig_publish_post", "Published after you said yes"]
  ];
  const tagColor = (t) => (t === "READ" ? c.cyan : c.glow ? c.acid : c.ink);
  const hud = rows.map(([t, tool, out], i) => {
    const y = 150 + i * 50;
    const fillTag = !c.glow && t === "WRITE";
    return `<rect x="806" y="${y - 13}" width="${t.length * 8 + 12}" height="18" fill="${fillTag ? c.acid : "none"}" stroke="${tagColor(t)}"/>
<text x="812" y="${y}" ${M} font-size="10" fill="${tagColor(t)}">${t}</text>
<text x="${806 + t.length * 8 + 24}" y="${y + 1}" ${M} font-size="14" fill="${c.ink}">${tool}</text>
<text x="806" y="${y + 23}" ${B} font-size="14" fill="${c.muted}">→ ${out}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 400" width="1280" height="400" role="img" aria-label="Glim: run your Instagram from any AI chat">
<defs><style>${FONTS}</style>
<filter id="glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="h" cx=".72" cy=".55" r=".5"><stop offset="0" stop-color="${c.pink}" stop-opacity="${c.glow ? 0.22 : 0}"/><stop offset="1" stop-color="${c.pink}" stop-opacity="0"/></radialGradient>
<clipPath id="frame"><rect width="1280" height="400"/></clipPath></defs>
<g clip-path="url(#frame)">
<rect width="1280" height="400" fill="${c.bg}"/><rect width="1280" height="400" fill="url(#h)"/>
${floor(c, 1280, 250, 150)}
${sparkle(56, 40, 1, c.glow ? c.acid : c.ink)}
<text x="96" y="66" ${D} font-size="34" letter-spacing="2" fill="${c.glow ? c.acid : c.ink}"${c.glow ? ' filter="url(#glow)"' : ""}>GLIM</text>
<text x="190" y="64" ${M} font-size="11" fill="${c.muted}">MCP//IG · OPEN SOURCE</text>
<text x="56" y="168" ${D} font-size="86" fill="${c.ink}">RUN YOUR INSTAGRAM</text>
${c.glow ? "" : `<rect x="48" y="184" width="598" height="84" fill="${c.acid}"/>`}
<text x="56" y="256" ${D} font-size="86" fill="${c.glow ? c.acid : c.ink}"${c.glow ? ' filter="url(#glow)"' : ""}>FROM ANY AI CHAT</text>
<rect x="56" y="300" width="14" height="14" fill="${c.pink}"/>
<text x="80" y="312" ${M} font-size="13" fill="${c.ink}">17 MCP tools · official Graph API · two-step publishing · demo mode</text>
${tags.map(([t, col], i) => `<rect x="${56 + i * 96}" y="334" width="${t.length * 9 + 14}" height="22" fill="${i === 2 ? col : "none"}" stroke="${col}"/><text x="${63 + i * 96}" y="349" ${M} font-size="11" fill="${i === 2 ? (c.glow ? c.onAcid : "#fff") : (i === 1 && !c.glow ? c.ink : col)}">${t}</text>`).join("")}
<polygon points="${cut(782, 92, 444, 246)}" fill="${c.panel}" stroke="${c.glow ? c.cyan : c.ink}" stroke-width="1.5"/>
<text x="806" y="113" ${M} font-size="10" fill="${c.muted}">CH-01 // CLAUDE ⟷ GLIM</text>
<text x="1200" y="113" text-anchor="end" ${M} font-size="10" fill="${c.glow ? c.acid : c.pink}">LINK STABLE</text>
<line x1="783" y1="120" x2="1225" y2="120" stroke="${c.line}"/>
${hud}
<path d="M774 100 V84 H790" fill="none" stroke="${c.glow ? c.acid : c.pink}" stroke-width="2.5"/><path d="M1234 330 V346 H1218" fill="none" stroke="${c.glow ? c.acid : c.pink}" stroke-width="2.5"/>
</g></svg>`;
}

function howItWorks(c) {
  const box = (x, w, idx, title, lines, hot = false) =>
    `<polygon points="${cut(x, 70, w, 170)}" fill="${hot && !c.glow ? c.acid : c.panel}" stroke="${hot ? (c.glow ? c.acid : c.ink) : c.glow ? c.line : c.ink}" stroke-width="${hot ? 2 : 1.2}"/>
<text x="${x + 22}" y="98" ${M} font-size="11" fill="${hot && c.glow ? c.acid : c.glow ? c.pink : c.pink}">${idx}</text>
<text x="${x + 22}" y="134" ${D} font-size="30" fill="${c.ink}">${title}</text>
${lines.map((l, i) => `<text x="${x + 22}" y="${166 + i * 24}" ${B} font-size="15" fill="${hot && !c.glow ? c.ink : c.muted}">${l}</text>`).join("")}`;
  const arrow = (x1, x2, top, bottom) =>
    `<path d="M${x1 + 6} 136 H${x2 - 12}" stroke="${c.glow ? c.cyan : c.ink}" stroke-width="2"/><path d="M${x2 - 14} 130 L${x2 - 4} 136 L${x2 - 14} 142" fill="none" stroke="${c.glow ? c.cyan : c.ink}" stroke-width="2"/>
<path d="M${x2 - 6} 182 H${x1 + 12}" stroke="${c.muted}" stroke-width="2" stroke-dasharray="5 5"/><path d="M${x1 + 14} 176 L${x1 + 4} 182 L${x1 + 14} 188" fill="none" stroke="${c.muted}" stroke-width="2"/>
<text x="${(x1 + x2) / 2}" y="124" text-anchor="middle" ${M} font-size="10" fill="${c.ink}">${top}</text>
<text x="${(x1 + x2) / 2}" y="206" text-anchor="middle" ${M} font-size="10" fill="${c.muted}">${bottom}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 300" width="1280" height="300" role="img" aria-label="How Glim works: your AI client talks to Glim over MCP on your computer, and Glim calls Instagram's official Graph API with your token">
<defs><style>${FONTS}</style></defs>
<rect width="1280" height="300" fill="${c.bg}"/>
<text x="40" y="44" ${M} font-size="12" fill="${c.pink}">// HOW IT WORKS</text>
${box(40, 300, "NODE.01", "YOUR AI CLIENT", ["Claude Desktop, Claude Code,", "Cursor, any MCP host", "You approve each action"])}
${arrow(340, 490, "MCP · STDIO", "ANSWERS")}
${box(490, 300, "NODE.02 · YOUR MACHINE", "GLIM-MCP", ["Runs on your computer", "Checks input, previews posts", "Token stays in env"], true)}
${arrow(790, 940, "HTTPS + BEARER", "JSON")}
${box(940, 300, "NODE.03", "INSTAGRAM GRAPH API", ["Meta's official API (v26)", "Business &amp; Creator accounts", "No passwords, no scraping"])}
<text x="40" y="276" ${B} font-size="14" fill="${c.muted}">No token? Glim answers from a built-in fictional account (demo mode), so every tool can be tried safely.</text>
</svg>`;
}

for (const [name, c] of Object.entries(themes)) {
  writeFileSync(join(here, `banner-${name}.svg`), banner(c));
  writeFileSync(join(here, `how-it-works-${name}.svg`), howItWorks(c));
}
console.log("Wrote banner and how-it-works SVGs (dark + light) with embedded fonts");
