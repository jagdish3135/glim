# Glim        Goal: let any MCP client (Claude, Cursor) run an Instagram professional account through the official API.
Users: creators, small businesses and social media managers with an Instagram Business/Creator account.

## Stories
- US-1 Profile + media: see account info and recent posts with likes/comments, paged.
  - `ig_get_profile`, `ig_list_media` (cursor paging), `ig_get_media` return markdown or JSON.
- US-2 Insights: account stats (views, reach, interactions, follower demographics) and per-post stats.
  - Uses current metric names (`views`, not deprecated `impressions`); wrong metric -> clear error listing valid ones.
- US-3 Publish with a confirm step: image, carousel (2-10), reel, story from public HTTPS URLs.
  - `ig_prepare_post` builds containers, waits until FINISHED, returns a preview + container id; nothing is public yet.
  - `ig_publish_post` publishes a prepared container; `ig_get_publishing_limit` shows the 24 h quota.
  - Caption <= 2200 chars, <= 30 hashtags, <= 20 mentions, http/non-URL input rejected before any API call.
- US-4 Comments: list (with replies), reply, hide/unhide, delete on own posts.
  - Delete is marked destructive; hide is idempotent.
- US-5 DMs: list conversations, read the last 20 messages, send a text reply.
  - Outside the 24 h window the error says why and what to do.
- US-6 Hashtags: search a hashtag, get top or recent posts.
  - With an Instagram-login token the tool explains it needs a Facebook-login token (Meta limit), no crash.
- US-7 Demo mode: no token -> a fictional sample account so anyone can try every tool safely.
- US-8 Landing page: what it is, tool list, copy-paste setup for Claude Desktop/Code/Cursor, token guide.

## Look (landing page only)
Editorial "contact sheet" feel: warm paper light theme, ink dark theme, one accent (sunset orange #e4572e),
film-strip frames for tools. Fraunces headings, Inter body, JetBrains Mono code. Light default, toggle remembered.
Polish: 360 px no sideways scroll, 44 px targets, focus rings, 4.5:1 contrast, copy buttons with "Copied" state,
animated chat demo (reduced-motion aware), favicon + title, Knit footer badge. No Instagram logo or Meta branding.

## Build
- TypeScript, `@modelcontextprotocol/server` v2 + zod 4, stdio transport, Node >= 20. Tests: vitest. Site: plain HTML/CSS/JS.
- `src/index.ts` (entry, createServer) · `src/graph.ts` (client: host by token type, Bearer header, timeout,
  Graph error -> recovery message, token never echoed) · `src/demo.ts` (in-process fake Graph API, same paths)
  · `src/tools/{account,insights,publish,comments,messages,hashtags}.ts` · `src/format.ts` (markdown/JSON + 25k cap)
- Env: `INSTAGRAM_ACCESS_TOKEN` (IG... -> graph.instagram.com, EAA... -> graph.facebook.com),
  `INSTAGRAM_USER_ID` (needed for Facebook-login tokens), `INSTAGRAM_API_VERSION` (default v26.0).
- `site/` static landing page (Vercel). `scripts/smoke.ts` stdio self-check against demo mode.

## Tasks
- [x] 1 Scaffold (package glim-mcp, bin glim-mcp): package, tsconfig, vitest, git (repo-local identity), .gitignore, .env.example, graphify (all)
- [x] 2 Graph client + demo backend + profile/media tools + format helpers (US-1, US-7)
- [x] 3 Insights tools (US-2)
- [x] 4 Prepare/publish/limit tools with validation (US-3)
- [x] 5 Comment tools (US-4)
- [x] 6 DM tools + hashtag tools (US-5, US-6)
- [ ] 7 Tests for validation, error mapping, host detection, publish/comment flows; smoke script
- [ ] 8 Landing page (US-8)
- [ ] 9 Check: quality card, README with media + badge; then ask before GitHub / npm / Vercel

## Decisions
- Official API only (user choice); no scraping or password login: ToS-safe, no bans.
- Publishing is two-step so the model (and user) sees a preview before anything goes public.
- Hashtag search needs Facebook-login tokens; DMs need Meta advanced access for accounts you don't own.
- Token stays in env; never returned by a tool, never in URLs (Bearer header).
- Risk: Meta renames metrics often -> metric lists live in one file; API version is configurable.
- Lean cuts: no token-refresh tool (would expose the token), no HTTP transport in v1, no media delete
  (Facebook-login only), no webhooks.
