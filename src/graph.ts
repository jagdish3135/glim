import type { Config, LoginType } from "./config.js";

export type Params = Record<string, string | number | boolean | undefined>;

export interface GraphRequest {
  method: "GET" | "POST" | "DELETE";
  path: string;
  params?: Params;
  body?: unknown;
}

export type Transport = (req: GraphRequest, signal: AbortSignal) => Promise<unknown>;

/** An error in the Graph API's own shape, so live and demo errors are explained the same way. */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly status?: number
  ) {
    super(message);
  }
}

/** Turns a Graph API error into a message that tells the model (and the user) how to recover. */
export function explainGraphError(err: GraphError): string {
  const meta = err.message ? ` Instagram said: "${err.message}"` : "";
  const { code, subcode } = err;
  if (code === 190) {
    return "The Instagram access token is invalid or expired. Long-lived tokens last 60 days: create or refresh one in your Meta app and update INSTAGRAM_ACCESS_TOKEN." + meta;
  }
  if (code === 10 && subcode === 2534022) {
    return "This person can't be messaged right now: Instagram only allows replies within 24 hours of their last message. Wait until they message the account again." + meta;
  }
  if (code === 551) return "This person isn't available to message (they may have blocked the account or restricted messages)." + meta;
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "Instagram rate limit reached. Wait a few minutes before making more requests." + meta;
  }
  if (subcode === 2207042) return "The account has hit its publishing limit for the last 24 hours. Check ig_get_publishing_limit and try later." + meta;
  if (subcode === 2207027 || code === 9007) return "The media is still processing. Wait a minute, then call ig_publish_post again." + meta;
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) {
    return "Permission denied. The token is missing a permission for this action (e.g. instagram_business_content_publish, _manage_comments, _manage_messages or _manage_insights), or the app lacks Advanced Access." + meta;
  }
  if (code === 100) return `Instagram rejected a parameter.${meta} Check the IDs and values, then try again.`;
  if (err.status === 404 || code === 803) return "Not found. Check the ID; list tools such as ig_list_media return valid IDs." + meta;
  return `The Instagram API returned an error${code ? ` (code ${code})` : ""}.${meta}`;
}

const TIMEOUT_MS = 30_000;

export function liveTransport(cfg: Config): Transport {
  return async (req, signal) => {
    const url = new URL(`${cfg.baseUrl}/${req.path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(req.params ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    let res: Response;
    try {
      res = await fetch(url, {
        method: req.method,
        // Token in a header, never in the URL, so it can't leak into logs or error text
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/json",
          ...(req.body ? { "Content-Type": "application/json" } : {})
        },
        body: req.body ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        throw new Error("The Instagram API didn't respond within 30 seconds. Try again.");
      }
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw new Error("Couldn't reach the Instagram API. Check the internet connection and try again.");
    }
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } };
    if (!res.ok || json.error) {
      const e = json.error ?? {};
      const message = (e.message ?? "").split(cfg.token ?? "\u0000").join("[token]");
      throw new GraphError(message, e.code, e.error_subcode, res.status);
    }
    return json;
  };
}

export class Graph {
  private igUserId?: Promise<string>;

  constructor(
    readonly loginType: LoginType,
    private readonly transport: Transport,
    private readonly configuredUserId?: string,
    /** How long publishing waits between status checks. */
    readonly pollMs = 3000
  ) {}

  async call<T>(req: GraphRequest, signal: AbortSignal = new AbortController().signal): Promise<T> {
    try {
      return (await this.transport(req, signal)) as T;
    } catch (e) {
      if (e instanceof GraphError) throw new Error(explainGraphError(e));
      throw e;
    }
  }

  get<T>(path: string, params?: Params, signal?: AbortSignal) {
    return this.call<T>({ method: "GET", path, params }, signal);
  }
  post<T>(path: string, body: unknown, signal?: AbortSignal) {
    return this.call<T>({ method: "POST", path, body }, signal);
  }
  delete<T>(path: string, signal?: AbortSignal) {
    return this.call<T>({ method: "DELETE", path }, signal);
  }

  /** The Instagram professional account ID that every account-level endpoint needs. Resolved once. */
  userId(signal?: AbortSignal): Promise<string> {
    this.igUserId ??= this.resolveUserId(signal).catch((e) => {
      this.igUserId = undefined; // let the next call retry
      throw e;
    });
    return this.igUserId;
  }

  private async resolveUserId(signal?: AbortSignal): Promise<string> {
    if (this.configuredUserId) return this.configuredUserId;
    if (this.loginType === "facebook") {
      type Pages = { data: { instagram_business_account?: { id: string } }[] };
      const pages = await this.get<Pages>("me/accounts", { fields: "instagram_business_account" }, signal);
      const id = pages.data.find((p) => p.instagram_business_account)?.instagram_business_account?.id;
      if (!id) {
        throw new Error("No Instagram professional account is linked to this Facebook token's Pages. Link one, or set INSTAGRAM_USER_ID.");
      }
      return id;
    }
    const me = await this.get<{ id: string; user_id?: string }>("me", { fields: "user_id" }, signal);
    return me.user_id ?? me.id;
  }

  /** DMs and hashtag search exist only on one of the two Instagram APIs; say so plainly instead of failing oddly. */
  requireLogin(needed: "instagram" | "facebook", feature: string): void {
    if (this.loginType === "demo" || this.loginType === needed) return;
    if (needed === "facebook") {
      throw new Error(`${feature} is only available through the Instagram API with Facebook Login (a token starting with "EAA" and the Instagram Public Content Access feature). Your token uses Instagram Login, which Meta doesn't offer this for.`);
    }
    throw new Error(`${feature} in Glim works with Instagram Login tokens (starting with "IG", permission instagram_business_manage_messages). Your token uses Facebook Login.`);
  }
}
