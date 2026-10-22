/**
 * Self-check: starts the built server over stdio in demo mode, calls its tools, exits non-zero on failure.
 * Run with: npm run build && npm run smoke
 */
import { strict as assert } from "node:assert";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client({ name: "glim-smoke", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: getDefaultEnvironment() }));

const { tools } = await client.listTools();
assert.equal(tools.length, 17, `expected 17 tools, got ${tools.length}`);

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { isError: r.isError, text: (r.content as { text: string }[])[0].text };
};

const profile = await call("ig_get_profile");
assert.ok(!profile.isError && profile.text.includes("demo"), profile.text);

const media = await call("ig_list_media", { limit: 3 });
assert.ok(!media.isError && media.text.includes("# Posts (3)"), media.text);

const bad = await call("ig_list_media", { limit: 500 });
assert.equal(bad.isError, true, "limit 500 should be rejected");

await client.close();
console.error(`Smoke test passed: ${tools.length} tools over stdio`);
