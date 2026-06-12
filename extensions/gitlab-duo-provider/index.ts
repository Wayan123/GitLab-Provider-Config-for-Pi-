import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Message,
  type Model,
  type OAuthCredentials,
  type OAuthLoginCallbacks,
  type SimpleStreamOptions,
  type StopReason,
} from "@earendil-works/pi-ai";

const HOME = homedir();
const DUO_BIN = join(HOME, ".nvm", "versions", "node", process.version, "bin", "duo");
const DUO_STORAGE = join(HOME, ".gitlab", "storage.json");
const CONFIG_PATH = join(HOME, ".pi", "agent", "gitlab-duo-provider.json");
const DEFAULT_DUO_WORKSPACE = join(HOME, ".pi", "agent", "tmp", "gitlab-duo-workspace");
const TOKEN_WORKSPACES_DIR = join(HOME, ".pi", "agent", "tmp", "gitlab-duo-token-workspaces");
const DEFAULT_GITLAB_BASE_URL = "https://gitlab.com";
const GITLAB_OAUTH_CLIENT_ID = "da4edff2e6ebd2bc3208611e2768bc1c1dd7be791dc5ff26ca34ca9ee44f7d4b";
const GITLAB_OAUTH_REDIRECT_URI = "http://127.0.0.1:8080/callback";
const GITLAB_OAUTH_SCOPES = ["api"];

type DuoOAuthCredentials = OAuthCredentials & {
  source?: string;
  duoPath?: string;
  gitlabBaseUrl?: string;
};

type GitLabDuoProviderConfig = {
  baseUrl?: string;
  defaultProjectPath?: string;
  defaultWorkspace?: string;
  preferProjectGitLabRemote?: boolean;
  fallbackToDefaultWorkspace?: boolean;
  logLevel?: "error" | "warn" | "info" | "debug";
};

const GITLAB_DUO_MODELS = [
  {
    id: "claude_fable_5",
    name: "Claude Fable 5 - Anthropic (GitLab Duo)",
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  {
    id: "claude_sonnet_4_6",
    name: "Claude Sonnet 4.6 - Anthropic (GitLab Duo)",
    contextWindow: 1_000_000,
    maxTokens: 64_000,
  },
  {
    id: "claude_sonnet_4_6_vertex",
    name: "Claude Sonnet 4.6 - Vertex (GitLab Duo)",
    contextWindow: 1_000_000,
    maxTokens: 64_000,
  },
  {
    id: "claude_haiku_4_5_20251001",
    name: "Claude Haiku 4.5 - Anthropic (GitLab Duo)",
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
  {
    id: "claude_opus_4_6_20260205",
    name: "Claude Opus 4.6 - Anthropic (GitLab Duo)",
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  {
    id: "gpt_5_2",
    name: "GPT-5.2 - OpenAI (GitLab Duo)",
    contextWindow: 400_000,
    maxTokens: 128_000,
  },
  {
    id: "gpt_5",
    name: "GPT-5.1 - OpenAI (GitLab Duo)",
    contextWindow: 400_000,
    maxTokens: 128_000,
  },
  {
    id: "gpt_5_mini",
    name: "GPT-5 Mini - OpenAI (GitLab Duo)",
    contextWindow: 400_000,
    maxTokens: 128_000,
  },
  {
    id: "gpt_5_codex",
    name: "GPT-5 Codex - OpenAI (GitLab Duo)",
    contextWindow: 400_000,
    maxTokens: 128_000,
  },
  {
    id: "gemini_3_5_flash_vertex",
    name: "Gemini 3.5 Flash - Vertex (GitLab Duo)",
    contextWindow: 1_000_000,
    maxTokens: 65_536,
  },
  {
    id: "kimi_k2_6_fireworks",
    name: "Kimi K2.6 - Fireworks (GitLab Duo)",
    contextWindow: 256_000,
    maxTokens: 32_768,
  },
  {
    id: "minimax_m2_7_fireworks",
    name: "MiniMax M2.7 - Fireworks (GitLab Duo)",
    contextWindow: 196_000,
    maxTokens: 65_536,
  },
  {
    id: "glm_5_1_fireworks",
    name: "GLM 5.1 - Fireworks (GitLab Duo)",
    contextWindow: 200_000,
    maxTokens: 8_192,
  },
];

function loadConfig(): Required<GitLabDuoProviderConfig> {
  let fileConfig: GitLabDuoProviderConfig = {};
  try {
    if (existsSync(CONFIG_PATH)) {
      fileConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as GitLabDuoProviderConfig;
    }
  } catch {
    fileConfig = {};
  }

  return {
    baseUrl: process.env.GITLAB_BASE_URL || process.env.GITLAB_URL || fileConfig.baseUrl || DEFAULT_GITLAB_BASE_URL,
    defaultProjectPath: process.env.GITLAB_DUO_PROJECT_PATH || fileConfig.defaultProjectPath || "future-org-group/future-org-project",
    defaultWorkspace: process.env.GITLAB_DUO_CWD || fileConfig.defaultWorkspace || DEFAULT_DUO_WORKSPACE,
    preferProjectGitLabRemote: process.env.GITLAB_DUO_ALWAYS_USE_DEFAULT === "1" ? false : fileConfig.preferProjectGitLabRemote ?? true,
    fallbackToDefaultWorkspace: fileConfig.fallbackToDefaultWorkspace ?? true,
    logLevel: (process.env.GITLAB_DUO_LOG_LEVEL as GitLabDuoProviderConfig["logLevel"]) || fileConfig.logLevel || "debug",
  };
}

function baseUrlToGitRemote(baseUrl: string, projectPath: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${projectPath.replace(/^\//, "")}.git`;
}

function findDuoBin(): string | undefined {
  const candidates = [
    process.env.DUO_CLI_PATH,
    DUO_BIN,
    join(HOME, ".nvm", "versions", "node", "v22.22.1", "bin", "duo"),
    "/usr/local/bin/duo",
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate));
}

function isGitRepo(cwd: string): boolean {
  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === "true";
}

function gitOutput(args: string[]): string | undefined {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function gitLabHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "gitlab.com";
  }
}

function hasGitLabRemote(cwd: string, baseUrl: string): boolean {
  if (!isGitRepo(cwd)) return false;
  const remotes = gitOutput(["-C", cwd, "remote", "-v"]) || "";
  const host = gitLabHost(baseUrl).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:https?://${host}/|git@${host}:)`, "i").test(remotes);
}

function ensureTokenWorkspace(token: string): string {
  const id = createHash("sha256").update(token).digest("hex").slice(0, 12);
  const workspace = join(TOKEN_WORKSPACES_DIR, id);
  mkdirSync(workspace, { recursive: true });
  if (!isGitRepo(workspace)) {
    spawnSync("git", ["init"], { cwd: workspace, stdio: "ignore" });
  }
  // A token may belong to a different account/group than the configured
  // fallback project. Removing origin lets Duo CLI use that token's own
  // default Duo namespace instead of failing against a stale project remote.
  spawnSync("git", ["-C", workspace, "remote", "remove", "origin"], { stdio: "ignore" });
  return workspace;
}

function ensureDefaultWorkspace(config: Required<GitLabDuoProviderConfig>): string {
  const workspace = config.defaultWorkspace;
  mkdirSync(workspace, { recursive: true });
  if (!isGitRepo(workspace)) {
    spawnSync("git", ["init"], { cwd: workspace, stdio: "ignore" });
  }
  const remoteUrl = baseUrlToGitRemote(config.baseUrl, config.defaultProjectPath);
  if (isGitRepo(workspace)) {
    const currentRemote = gitOutput(["-C", workspace, "remote", "get-url", "origin"]);
    if (currentRemote) {
      spawnSync("git", ["-C", workspace, "remote", "set-url", "origin", remoteUrl], { stdio: "ignore" });
    } else {
      spawnSync("git", ["-C", workspace, "remote", "add", "origin", remoteUrl], { stdio: "ignore" });
    }
  }
  return workspace;
}

function resolveDuoCwd(token?: string): string {
  if (token) return ensureTokenWorkspace(token);
  const config = loadConfig();
  const explicitCwd = process.env.GITLAB_DUO_CWD;
  if (explicitCwd && isGitRepo(explicitCwd)) return explicitCwd;
  if (config.preferProjectGitLabRemote && hasGitLabRemote(process.cwd(), config.baseUrl)) return process.cwd();
  if (config.fallbackToDefaultWorkspace) return ensureDefaultWorkspace(config);
  return process.cwd();
}

function detectDuo(): { installed: boolean; path?: string; hasStorage: boolean; baseUrl: string; config: Required<GitLabDuoProviderConfig> } {
  const path = findDuoBin();
  const config = loadConfig();
  return {
    installed: Boolean(path),
    path,
    hasStorage: existsSync(DUO_STORAGE),
    baseUrl: config.baseUrl,
    config,
  };
}

function normalizeToken(token: string | undefined): string | undefined {
  const trimmed = token?.trim();
  if (!trimmed || trimmed === "missing-gitlab-token" || trimmed.startsWith("$")) return undefined;
  return trimmed;
}

function resolveToken(options?: SimpleStreamOptions): string | undefined {
  // Explicit Pi /login API-key or OAuth credentials win. Placeholder values like
  // "$GITLAB_TOKEN" are ignored so Duo CLI can fall back to its own config.
  return (
    normalizeToken(options?.apiKey) ||
    normalizeToken(process.env.GITLAB_TOKEN) ||
    normalizeToken(process.env.GITLAB_AUTH_TOKEN) ||
    normalizeToken(process.env.GITLAB_OAUTH_TOKEN)
  );
}

function readJsonFile(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeDuoCliToken(token: string, baseUrl = DEFAULT_GITLAB_BASE_URL) {
  mkdirSync(join(HOME, ".gitlab"), { recursive: true });
  const storage = readJsonFile(DUO_STORAGE);
  storage["duo-cli-config"] = { gitlabAuthToken: token, gitlabBaseUrl: baseUrl };
  writeFileSync(DUO_STORAGE, `${JSON.stringify(storage, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(DUO_STORAGE, 0o600);
}

function credentials(): DuoOAuthCredentials {
  const detected = detectDuo();
  return {
    access: "$GITLAB_TOKEN",
    refresh: "$GITLAB_TOKEN",
    expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    source: detected.hasStorage ? "duo-cli-credential-helper" : "missing-token",
    duoPath: detected.path,
    gitlabBaseUrl: detected.baseUrl,
  };
}

function compactText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n...[truncated]`;
}

function compactTail(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `[truncated...]\n${text.slice(-maxChars)}`;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

function extractDuoAnswer(rawOutput: string): string | undefined {
  const clean = stripAnsi(rawOutput);
  const matches = Array.from(
    clean.matchAll(/"role"\s*:\s*"assistant"[\s\S]*?"content"\s*:\s*"((?:\\.|[^"\\])*)"/g),
  );
  const last = matches.at(-1)?.[1];
  if (last) return unescapeJsonString(last).trim();
  return undefined;
}

function extractDuoError(rawOutput: string): string {
  const clean = stripAnsi(rawOutput).replace(/glpat-[A-Za-z0-9_.-]+/g, "glpat-REDACTED");
  const lines = clean.split(/\r?\n/);
  const errorIndexes = lines
    .map((line, index) => (/\[error\]|Error:|failed|Failed|HTTP 4\d\d|Group Not Found|experimental\/beta/i.test(line) ? index : -1))
    .filter((index) => index >= 0);
  if (errorIndexes.length > 0) {
    const start = Math.max(0, errorIndexes[0] - 2);
    return compactTail(lines.slice(start).join("\n").trim(), 6_000);
  }
  return compactTail(clean.trim(), 6_000);
}

function messageToText(message: Message): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return `User: ${message.content}`;
    return `User: ${message.content.map((part) => (part.type === "text" ? part.text : `[${part.type} attachment]`)).join("\n")}`;
  }
  if (message.role === "assistant") {
    return `Assistant: ${message.content
      .map((part) => {
        if (part.type === "text") return part.text;
        if (part.type === "thinking") return "[thinking omitted]";
        if (part.type === "toolCall") return `[tool call: ${part.name}]`;
        return `[${part.type}]`;
      })
      .join("\n")}`;
  }
  if (message.role === "toolResult") {
    return `Tool result (${message.toolName ?? message.toolCallId}): ${message.content
      .map((part) => (part.type === "text" ? part.text : `[${part.type} attachment]`))
      .join("\n")}`;
  }
  return "";
}

function buildDuoPrompt(context: Context): string {
  const latestUser = [...context.messages].reverse().find((message) => message.role === "user");
  const pieces: string[] = [
    "You are being called as a model backend from Pi CLI. Answer the user's latest message directly and concisely. Do not modify files, create commits, open merge requests, or run shell actions. If a task requires tool execution, explain what should be done instead of performing it.",
  ];
  if (context.systemPrompt) {
    pieces.push(`Important Pi instructions:\n${compactText(context.systemPrompt, 2_000)}`);
  }
  if (latestUser) {
    pieces.push(compactText(messageToText(latestUser), 8_000));
  } else {
    pieces.push("User: Hello");
  }
  return compactText(pieces.filter(Boolean).join("\n\n---\n\n"), 12_000);
}

function streamGitLabDuoCli(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const output: AssistantMessage = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };

  const detected = detectDuo();
  if (!detected.installed || !detected.path) {
    output.stopReason = "error";
    output.errorMessage = "GitLab Duo CLI not found. Install with: npm install -g @gitlab/duo-cli";
    stream.push({ type: "error", reason: "error", error: output });
    stream.end();
    return stream;
  }

  const token = resolveToken(options);
  if (token) {
    writeDuoCliToken(token, detected.baseUrl);
  }

  stream.push({ type: "start", partial: output });

  const duoCwd = resolveDuoCwd(token);
  const args = [
    "--log-level",
    detected.config.logLevel,
    "--cwd",
    duoCwd,
    "--gitlab-base-url",
    detected.baseUrl,
    ...(token ? ["--gitlab-auth-token", token] : []),
    "--model",
    model.id,
    "run",
    "--workflow-type",
    "chat",
    "--goal",
    buildDuoPrompt(context),
  ];

  let stdout = "";
  let stderr = "";
  const childEnv = {
    ...process.env,
    GITLAB_BASE_URL: detected.baseUrl,
    LOG_LEVEL: detected.config.logLevel,
    NO_COLOR: "1",
  } as NodeJS.ProcessEnv;
  if (token) {
    childEnv.GITLAB_TOKEN = token;
  } else {
    delete childEnv.GITLAB_TOKEN;
    delete childEnv.GITLAB_AUTH_TOKEN;
    delete childEnv.GITLAB_OAUTH_TOKEN;
  }

  const child = spawn(detected.path, args, {
    cwd: duoCwd,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const abort = () => child.kill("SIGTERM");
  options?.signal?.addEventListener("abort", abort, { once: true });

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("error", (error) => {
    output.stopReason = "error";
    output.errorMessage = error.message;
    stream.push({ type: "error", reason: "error", error: output });
    stream.end();
  });
  child.on("close", (code, signal) => {
    options?.signal?.removeEventListener("abort", abort);
    if (options?.signal?.aborted) {
      output.stopReason = "aborted" as StopReason;
      stream.push({ type: "error", reason: "aborted", error: output });
      stream.end();
      return;
    }

    const rawText = `${stdout}\n${stderr}`;
    const text = extractDuoAnswer(rawText) || stripAnsi(stdout).trim();
    if (code && code !== 0) {
      output.stopReason = "error";
      output.errorMessage = extractDuoError(rawText || `duo exited with code ${code}${signal ? ` (${signal})` : ""}`);
      stream.push({ type: "error", reason: "error", error: output });
      stream.end();
      return;
    }

    output.content.push({ type: "text", text: text || "GitLab Duo returned no assistant text." });
    stream.push({ type: "text_start", contentIndex: 0, partial: output });
    stream.push({ type: "text_delta", contentIndex: 0, delta: output.content[0].type === "text" ? output.content[0].text : "", partial: output });
    stream.push({ type: "text_end", contentIndex: 0, content: output.content[0].type === "text" ? output.content[0].text : "", partial: output });
    stream.push({ type: "done", reason: output.stopReason as "stop" | "length" | "toolUse", message: output });
    stream.end();
  });

  return stream;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function personalAccessTokenUrl(baseUrl: string): string {
  const params = new URLSearchParams({
    name: "GitLab Duo Pi",
    scopes: "api,ai_features,read_repository",
  });
  return `${baseUrl.replace(/\/$/, "")}/-/user_settings/personal_access_tokens?${params.toString()}`;
}

async function loginWithBrowserOAuth(callbacks: OAuthLoginCallbacks, baseUrl: string): Promise<OAuthCredentials> {
  const { verifier, challenge } = generatePKCE();
  const authParams = new URLSearchParams({
    client_id: GITLAB_OAUTH_CLIENT_ID,
    redirect_uri: GITLAB_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: GITLAB_OAUTH_SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: randomUUID(),
  });

  callbacks.onAuth({
    url: `${baseUrl.replace(/\/$/, "")}/oauth/authorize?${authParams.toString()}`,
    instructions: "Login GitLab di browser, lalu paste redirect/callback URL di bawah.",
  });

  const callbackUrl = await callbacks.onPrompt({ message: "Paste callback URL dari browser:" });
  const code = new URL(callbackUrl).searchParams.get("code");
  if (!code) throw new Error("No authorization code found in callback URL");

  const tokenResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GITLAB_OAUTH_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: GITLAB_OAUTH_REDIRECT_URI,
    }).toString(),
  });

  if (!tokenResponse.ok) throw new Error(`Token exchange failed: ${await tokenResponse.text()}`);
  const data = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    created_at: number;
  };
  writeDuoCliToken(data.access_token, baseUrl);
  return {
    refresh: data.refresh_token,
    access: data.access_token,
    expires: (data.created_at + data.expires_in) * 1000 - 5 * 60 * 1000,
    source: "browser-oauth",
    gitlabBaseUrl: baseUrl,
  } as DuoOAuthCredentials;
}

async function loginWithPat(callbacks: OAuthLoginCallbacks, baseUrl: string): Promise<OAuthCredentials> {
  callbacks.onAuth({
    url: personalAccessTokenUrl(baseUrl),
    instructions: "Buat token dengan scope: api, ai_features, read_repository. Setelah token dibuat, paste token di prompt berikutnya.",
  });
  const token = normalizeToken(await callbacks.onPrompt({ message: "Paste GitLab Personal Access Token:" }));
  if (!token) throw new Error("Token cannot be empty");
  writeDuoCliToken(token, baseUrl);
  return {
    refresh: token,
    access: token,
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    source: "personal-access-token",
    gitlabBaseUrl: baseUrl,
  } as DuoOAuthCredentials;
}

async function loginGitLabDuo(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const detected = detectDuo();
  callbacks.onProgress?.(
    detected.installed
      ? `GitLab Duo CLI detected at ${detected.path}. Base URL: ${detected.baseUrl}`
      : "GitLab Duo CLI is not installed. Install with: npm install -g @gitlab/duo-cli",
  );

  const method = await callbacks.onSelect?.({
    message: "Select GitLab Duo login method:",
    options: [
      { id: "duo-config", label: "Use existing Duo CLI login/config" },
      { id: "browser-oauth", label: "Login in browser (OAuth link)" },
      { id: "pat", label: "Create/paste GitLab token" },
    ],
  });
  if (!method) throw new Error("Login cancelled");

  if (method === "browser-oauth") return loginWithBrowserOAuth(callbacks, detected.baseUrl);
  if (method === "pat") return loginWithPat(callbacks, detected.baseUrl);

  return credentials();
}

async function refreshGitLabDuoToken(credentialsIn: OAuthCredentials): Promise<OAuthCredentials> {
  const source = (credentialsIn as DuoOAuthCredentials).source;
  const baseUrl = (credentialsIn as DuoOAuthCredentials).gitlabBaseUrl || detectDuo().baseUrl;
  if (source !== "browser-oauth" || !normalizeToken(credentialsIn.refresh)) return credentialsIn;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GITLAB_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: credentialsIn.refresh,
    }).toString(),
  });
  if (!response.ok) throw new Error(`Token refresh failed: ${await response.text()}`);
  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    created_at: number;
  };
  writeDuoCliToken(data.access_token, baseUrl);
  return {
    refresh: data.refresh_token,
    access: data.access_token,
    expires: (data.created_at + data.expires_in) * 1000 - 5 * 60 * 1000,
    source: "browser-oauth",
    gitlabBaseUrl: baseUrl,
  } as DuoOAuthCredentials;
}

export default function (pi: ExtensionAPI) {
  const detected = detectDuo();

  pi.registerProvider("gitlab-duo", {
    name: "GitLab Duo CLI",
    baseUrl: detected.baseUrl,
    apiKey: process.env.GITLAB_TOKEN || process.env.GITLAB_AUTH_TOKEN || process.env.GITLAB_OAUTH_TOKEN || "$GITLAB_TOKEN",
    api: "gitlab-duo-cli" as Api,
    streamSimple: streamGitLabDuoCli,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStore: false,
      supportsStrictMode: false,
      maxTokensField: "max_tokens",
    },
    models: GITLAB_DUO_MODELS.map((model) => ({
      id: model.id,
      name: model.name,
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    })),
    oauth: {
      name: "GitLab Duo CLI",
      login: loginGitLabDuo,
      refreshToken: refreshGitLabDuoToken,
      getApiKey: (creds: OAuthCredentials) => creds.access,
    },
  });

  console.error(
    detected.installed
      ? `[gitlab-duo] CLI connected: ${detected.path}, base ${detected.baseUrl}, auth ${resolveToken() ? "env-token" : "duo-config"}, cwd ${resolveDuoCwd(resolveToken())}`
      : "[gitlab-duo] CLI not found; run: npm install -g @gitlab/duo-cli",
  );

  pi.registerCommand("gitlab-duo-status", {
    description: "Show GitLab Duo provider status",
    handler: async (_args, ctx) => {
      const status = detectDuo();
      ctx.ui.notify(
        status.installed
          ? `GitLab Duo CLI: ${status.path}; base ${status.baseUrl}; auth ${resolveToken() ? "env-token" : "duo-config"}; cwd ${resolveDuoCwd(resolveToken())}`
          : "GitLab Duo CLI not found. Install @gitlab/duo-cli.",
        status.installed ? "info" : "warning",
      );
    },
  });
}
