// Writes the README banner and "how it works" diagram in light and dark versions.
// Usage: node docs/readme/make-svgs.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const themes = {
  light: { paper: "#f6f1e7", card: "#fffaf0", ink: "#1d1a16", muted: "#5f574b", line: "#d9cfbd", accent: "#c8441d", soft: "#f0e3cf" },
  dark: { paper: "#15130f", card: "#1e1b16", ink: "#f1eadc", muted: "#b3a893", line: "#3a342b", accent: "#ff7a50", soft: "#2a241c" }
};
const SERIF = "Fraunces, Georgia, 'Times New Roman', serif";
const SANS = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', Consolas, 'Courier New', monospace";
const sparkle = (x, y, s, fill) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M16 3c1.2 7 5.8 11.8 13 13-7.2 1.2-11.8 6-13 13-1.2-7-5.8-11.8-13-13 7.2-1.2 11.8-6 13-13z" fill="${fill}"/>`;
const strip = (x, y, w, c) => `<rect x="${x}" y="${y}" width="${w}" height="6" fill="url(#holes-${c.paper.slice(1)})"/>`;

function banner(c) {
  const chips = ["17 MCP tools", "Official Graph API", "Two-step publishing", "Demo mode"];
  let cx = 72;
  const chipSvg = chips.map((t) => {
    const w = t.length * 8.6 + 34;
    const s = `<rect x="${cx}" y="296" width="${w}" height="36" rx="18" fill="${c.card}" stroke="${c.line}"/><text x="${cx + w / 2}" y="319" text-anchor="middle" font-family="${MONO}" font-size="14" fill="${c.muted}">${t}</text>`;
    cx += w + 10;
    return s;
  }).join("");
  const frames = [
    ["ig_get_media_insights", "22.4k views · 9.4 s watch"],
    ["ig_prepare_post", "Draft ready, not public yet"],
    ["ig_hide_comment", "Spam hidden"]
  ].map(([tool, out], i) => {
    const x = 790, y = 70 + i * 92;
    return `<g transform="rotate(${[-2, 1.2, -0.8][i]} ${x + 190} ${y + 38})"><rect x="${x}" y="${y}" width="380" height="76" rx="4" fill="${c.card}" stroke="${c.line}"/>${strip(x + 12, y + 6, 356, c)}${strip(x + 12, y + 64, 356, c)}<text x="${x + 22}" y="${y + 34}" font-family="${MONO}" font-size="15" fill="${c.accent}">⚙ ${tool}</text><text x="${x + 22}" y="${y + 55}" font-family="${SANS}" font-size="15" fill="${c.ink}">${out}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 400" width="1280" height="400" role="img" aria-label="Glim: run your Instagram from any AI chat">
<defs><pattern id="holes-${c.paper.slice(1)}" width="20" height="6" patternUnits="userSpaceOnUse"><rect width="10" height="6" rx="1" fill="${c.line}"/></pattern></defs>
<rect width="1280" height="400" rx="24" fill="${c.paper}"/>
${sparkle(72, 64, 1.6, c.ink)}<circle cx="135" cy="76" r="5" fill="${c.accent}"/>
<text x="132" y="104" font-family="${SERIF}" font-weight="700" font-size="52" fill="${c.ink}">glim</text>
<text x="72" y="190" font-family="${SERIF}" font-weight="700" font-size="54" fill="${c.ink}">Run your Instagram</text>
<text x="72" y="252" font-family="${SERIF}" font-style="italic" font-size="54" fill="${c.accent}">from any AI chat.</text>
${chipSvg}${frames}
</svg>`;
}

function howItWorks(c) {
  const box = (x, w, title, lines, accent = false) =>
    `<rect x="${x}" y="70" width="${w}" height="170" rx="14" fill="${accent ? c.soft : c.card}" stroke="${accent ? c.accent : c.line}" stroke-width="${accent ? 2 : 1}"/>
<text x="${x + 22}" y="110" font-family="${SERIF}" font-weight="700" font-size="24" fill="${c.ink}">${title}</text>
${lines.map((l, i) => `<text x="${x + 22}" y="${144 + i * 26}" font-family="${SANS}" font-size="15" fill="${c.muted}">${l}</text>`).join("")}`;
  const arrow = (x1, x2, top, bottom) =>
    `<path d="M${x1} 132 H${x2 - 8}" stroke="${c.ink}" stroke-width="2" marker-end="url(#a)"/><path d="M${x2} 178 H${x1 + 8}" stroke="${c.muted}" stroke-width="2" stroke-dasharray="5 5" marker-end="url(#b)"/>
<text x="${(x1 + x2) / 2}" y="120" text-anchor="middle" font-family="${MONO}" font-size="13" fill="${c.ink}">${top}</text>
<text x="${(x1 + x2) / 2}" y="200" text-anchor="middle" font-family="${MONO}" font-size="13" fill="${c.muted}">${bottom}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 300" width="1280" height="300" role="img" aria-label="How Glim works: your AI client talks to Glim over MCP on your machine, and Glim calls Instagram's official Graph API with your token">
<defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c.ink}"/></marker><marker id="b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c.muted}"/></marker></defs>
<rect width="1280" height="300" rx="24" fill="${c.paper}"/>
<text x="40" y="44" font-family="${MONO}" font-size="14" fill="${c.accent}">HOW IT WORKS</text>
${box(40, 300, "Your AI client", ["Claude Desktop, Claude Code,", "Cursor, any MCP host", "You approve each action"])}
${arrow(340, 490, "MCP · stdio", "answers")}
${box(490, 300, "glim-mcp", ["Runs on your computer", "Checks input, previews posts", "Token stays in env"], true)}
${arrow(790, 940, "HTTPS + Bearer", "JSON")}
${box(940, 300, "Instagram Graph API", ["Meta's official API (v26)", "Business &amp; Creator accounts", "No passwords, no scraping"])}
<text x="40" y="276" font-family="${SANS}" font-size="14" fill="${c.muted}">No token? Glim answers from a built-in fictional account (demo mode), so every tool can be tried safely.</text>
</svg>`;
}

for (const [name, c] of Object.entries(themes)) {
  writeFileSync(join(here, `banner-${name}.svg`), banner(c));
  writeFileSync(join(here, `how-it-works-${name}.svg`), howItWorks(c));
}
console.log("Wrote banner and how-it-works SVGs (light + dark)");
