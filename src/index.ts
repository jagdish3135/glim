#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { createDemoTransport } from "./demo.js";
import { Graph, liveTransport } from "./graph.js";
import { createServer, VERSION } from "./server.js";

const arg = process.argv[2];
if (arg === "--version" || arg === "-v") {
  console.error(VERSION);
  process.exit(0);
}

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  console.error(`glim-mcp: ${(e as Error).message}`);
  process.exit(1);
}

const graph =
  cfg.loginType === "demo"
    ? new Graph("demo", createDemoTransport(), cfg.userId, 50)
    : new Graph(cfg.loginType, liveTransport(cfg), cfg.userId);

serveStdio(() => createServer(graph));
// stdout carries the protocol, so status goes to stderr
console.error(
  cfg.loginType === "demo"
    ? `glim-mcp ${VERSION} running on stdio in DEMO mode (no INSTAGRAM_ACCESS_TOKEN set)`
    : `glim-mcp ${VERSION} running on stdio (${cfg.loginType} login)`
);
