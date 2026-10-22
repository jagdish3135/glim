export type LoginType = "instagram" | "facebook" | "demo";

export interface Config {
  loginType: LoginType;
  token?: string;
  userId?: string;
  baseUrl: string;
}

/** Instagram-login tokens start with "IG", Facebook-login (Page) tokens with "EAA". No token means demo mode. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.INSTAGRAM_ACCESS_TOKEN?.trim() || undefined;
  const version = (env.INSTAGRAM_API_VERSION?.trim() || "v26.0").replace(/^(?!v)/, "v");
  const userId = env.INSTAGRAM_USER_ID?.trim() || undefined;
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error(`INSTAGRAM_API_VERSION must look like v26.0, got "${version}".`);
  }
  if (!token) return { loginType: "demo", baseUrl: "demo://", userId };
  const loginType: LoginType = token.startsWith("EAA") ? "facebook" : "instagram";
  const host = loginType === "facebook" ? "graph.facebook.com" : "graph.instagram.com";
  return { loginType, token, userId, baseUrl: `https://${host}/${version}` };
}
