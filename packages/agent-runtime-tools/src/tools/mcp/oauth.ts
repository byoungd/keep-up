/**
 * MCP OAuth Helpers
 *
 * Minimal OAuth client provider and token store integration for MCP SDK transports.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  type AddClientAuthentication,
  auth,
  type OAuthClientProvider,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export type McpOAuthGrantType = "client_credentials" | "authorization_code";

export interface McpOAuthTokenStore {
  getTokens(): Promise<OAuthTokens | undefined>;
  saveTokens(tokens: OAuthTokens): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryMcpOAuthTokenStore implements McpOAuthTokenStore {
  private payload?: TokenStorePayload;
  private readonly entryKey?: string;

  constructor(config: TokenStoreSelectorConfig = {}) {
    this.entryKey = resolveTokenStoreKey(config);
  }

  async getTokens(): Promise<OAuthTokens | undefined> {
    return resolveTokens(this.payload, this.entryKey);
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.payload = mergeTokens(this.payload, tokens, this.entryKey);
  }

  async clear(): Promise<void> {
    this.payload = removeTokens(this.payload, this.entryKey);
  }
}

interface EncryptedTokenPayload {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

const DEFAULT_TOKEN_KEY = "__default__";

interface TokenStoreSelectorConfig {
  tokenKey?: string;
  accountId?: string;
  workspaceId?: string;
}

interface TokenStoreEntriesPayload {
  entries: Record<string, OAuthTokens>;
}

type TokenStorePayload = OAuthTokens | TokenStoreEntriesPayload;

export interface FileMcpOAuthTokenStoreConfig extends TokenStoreSelectorConfig {
  filePath: string;
  encryptionKey: string | Uint8Array;
  keyEncoding?: "hex" | "base64";
}

export type McpOAuthTokenStoreConfig =
  | ({ type: "memory" } & TokenStoreSelectorConfig)
  | ({ type: "file" } & FileMcpOAuthTokenStoreConfig);

export class FileMcpOAuthTokenStore implements McpOAuthTokenStore {
  private readonly filePath: string;
  private readonly key: Buffer;
  private readonly entryKey?: string;

  constructor(config: FileMcpOAuthTokenStoreConfig) {
    this.filePath = config.filePath;
    this.key = resolveEncryptionKey(config.encryptionKey, config.keyEncoding);
    this.entryKey = resolveTokenStoreKey(config);
  }

  async getTokens(): Promise<OAuthTokens | undefined> {
    try {
      const payload = await readFile(this.filePath, "utf-8");
      const decrypted = decryptPayload(payload, this.key);
      return resolveTokens(decrypted, this.entryKey);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const existing = await this.readPayload();
    const payload = encryptPayload(mergeTokens(existing, tokens, this.entryKey), this.key);
    await writeFile(this.filePath, payload, { mode: 0o600 });
  }

  async clear(): Promise<void> {
    const existing = await this.readPayload();
    const next = removeTokens(existing, this.entryKey);
    if (!next) {
      await this.deleteFile();
      return;
    }
    const payload = encryptPayload(next, this.key);
    await writeFile(this.filePath, payload, { mode: 0o600 });
  }

  private async readPayload(): Promise<TokenStorePayload | undefined> {
    try {
      const payload = await readFile(this.filePath, "utf-8");
      return decryptPayload(payload, this.key);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  private async deleteFile(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
}

export function resolveMcpOAuthTokenStore(
  store?: McpOAuthTokenStore | McpOAuthTokenStoreConfig
): McpOAuthTokenStore | undefined {
  if (!store) {
    return undefined;
  }
  if ("type" in store) {
    return store.type === "memory"
      ? new InMemoryMcpOAuthTokenStore(store)
      : new FileMcpOAuthTokenStore(store);
  }
  return store;
}

export interface McpOAuthClientConfig {
  clientId: string;
  clientSecret?: string;
  redirectUrl?: string;
  scopes?: string[];
  grantType?: McpOAuthGrantType;
  tokenStore?: McpOAuthTokenStore;
  clientMetadata?: Partial<OAuthClientMetadata>;
  onRedirect?: (authorizationUrl: URL) => void | Promise<void>;
}

export class McpOAuthClientProvider implements OAuthClientProvider {
  private readonly config: McpOAuthClientConfig;
  private readonly store: McpOAuthTokenStore;
  private codeVerifierValue?: string;

  constructor(config: McpOAuthClientConfig) {
    this.config = config;
    this.store = config.tokenStore ?? new InMemoryMcpOAuthTokenStore();
  }

  get redirectUrl(): string | URL | undefined {
    return this.config.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    const redirectUris = this.config.redirectUrl ? [String(this.config.redirectUrl)] : [];
    const grantType = this.config.grantType ?? "client_credentials";

    return {
      redirect_uris: redirectUris,
      grant_types: [grantType],
      response_types: grantType === "authorization_code" ? ["code"] : [],
      token_endpoint_auth_method: this.config.clientSecret ? "client_secret_basic" : "none",
      ...this.config.clientMetadata,
    };
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    };
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return this.store.getTokens();
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.store.saveTokens(tokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (!this.config.onRedirect) {
      throw new UnauthorizedError("OAuth redirect required but no redirect handler is configured.");
    }
    await this.config.onRedirect(authorizationUrl);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.codeVerifierValue = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    if (!this.codeVerifierValue) {
      throw new UnauthorizedError("Missing PKCE code verifier for OAuth flow.");
    }
    return this.codeVerifierValue;
  }

  async state(): Promise<string> {
    return crypto.randomUUID();
  }

  async prepareTokenRequest(scope?: string): Promise<URLSearchParams> {
    const grantType = this.config.grantType ?? "client_credentials";
    const params = new URLSearchParams();
    params.set("grant_type", grantType);

    const resolvedScope = scope ?? this.config.scopes?.join(" ");
    if (resolvedScope) {
      params.set("scope", resolvedScope);
    }

    return params;
  }

  addClientAuthentication: AddClientAuthentication = async (headers, params) => {
    if (!this.config.clientSecret) {
      return;
    }

    const token = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      "base64"
    );
    headers.set("Authorization", `Basic ${token}`);
    params.delete("client_secret");
  };
}

export function createMcpOAuthClientProvider(
  config: McpOAuthClientConfig,
  tokenStore?: McpOAuthTokenStore | McpOAuthTokenStoreConfig
): McpOAuthClientProvider {
  const resolvedStore = config.tokenStore ?? resolveMcpOAuthTokenStore(tokenStore);
  const resolvedConfig = resolvedStore ? { ...config, tokenStore: resolvedStore } : config;
  return new McpOAuthClientProvider(resolvedConfig);
}

export function splitScopes(scopes?: string): Set<string> {
  if (!scopes) {
    return new Set();
  }
  return new Set(
    scopes
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
}

export function hasScopes(tokenScopes: string | undefined, requiredScopes: string[]): boolean {
  if (requiredScopes.length === 0) {
    return true;
  }
  const available = splitScopes(tokenScopes);
  return requiredScopes.every((scope) => available.has(scope));
}

export interface McpOAuthSessionConfig {
  provider: OAuthClientProvider;
  serverUrl: string | URL;
  authorizationCode?: string;
}

export class McpOAuthSession {
  private readonly provider: OAuthClientProvider;
  private readonly serverUrl: string | URL;
  private authorizationCode?: string;

  constructor(config: McpOAuthSessionConfig) {
    this.provider = config.provider;
    this.serverUrl = config.serverUrl;
    this.authorizationCode = config.authorizationCode;
  }

  setAuthorizationCode(code: string): void {
    this.authorizationCode = code;
  }

  async ensureAuthorized(requiredScopes?: string[]): Promise<void> {
    if (!requiredScopes || requiredScopes.length === 0) {
      return;
    }

    const tokens = await this.provider.tokens();
    if (tokens && hasScopes(tokens.scope, requiredScopes)) {
      return;
    }

    const result = await auth(this.provider, {
      serverUrl: this.serverUrl,
      authorizationCode: this.authorizationCode,
      scope: requiredScopes.join(" "),
    });

    if (result === "REDIRECT") {
      throw new UnauthorizedError("OAuth redirect required to authorize MCP server.");
    }
  }
}

function resolveEncryptionKey(key: string | Uint8Array, encoding?: "hex" | "base64"): Buffer {
  const buffer = typeof key === "string" ? decodeKeyString(key, encoding) : Buffer.from(key);
  if (buffer.length !== 32) {
    throw new Error("MCP OAuth token store requires a 32-byte encryption key.");
  }
  return buffer;
}

function decodeKeyString(value: string, encoding?: "hex" | "base64"): Buffer {
  const trimmed = value.trim();
  if (encoding) {
    return Buffer.from(trimmed, encoding);
  }

  const isHex = /^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0;
  return Buffer.from(trimmed, isHex ? "hex" : "base64");
}

function encryptPayload(tokens: TokenStorePayload, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(tokens), "utf-8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedTokenPayload = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };

  return JSON.stringify(payload);
}

function decryptPayload(payload: string, key: Buffer): TokenStorePayload {
  const parsed = JSON.parse(payload) as EncryptedTokenPayload;
  if (parsed.version !== 1 || parsed.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported MCP OAuth token payload.");
  }

  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const ciphertext = Buffer.from(parsed.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf-8"
  );

  const raw = JSON.parse(plaintext) as unknown;
  if (isTokenEntriesPayload(raw)) {
    return raw;
  }
  if (isOAuthTokens(raw)) {
    return raw;
  }
  throw new Error("Unsupported MCP OAuth token payload.");
}

function resolveTokenStoreKey(config: {
  tokenKey?: string;
  accountId?: string;
  workspaceId?: string;
}): string | undefined {
  const tokenKey = config.tokenKey?.trim();
  if (tokenKey) {
    return tokenKey;
  }
  const accountId = config.accountId?.trim();
  const workspaceId = config.workspaceId?.trim();
  if (accountId && workspaceId) {
    return `account:${accountId}|workspace:${workspaceId}`;
  }
  if (accountId) {
    return `account:${accountId}`;
  }
  if (workspaceId) {
    return `workspace:${workspaceId}`;
  }
  return undefined;
}

function resolveTokens(
  payload: TokenStorePayload | undefined,
  entryKey: string | undefined
): OAuthTokens | undefined {
  if (!payload) {
    return undefined;
  }
  if (!entryKey) {
    if (isTokenEntriesPayload(payload)) {
      const defaultEntry = payload.entries[DEFAULT_TOKEN_KEY];
      if (defaultEntry) {
        return defaultEntry;
      }
      const keys = Object.keys(payload.entries);
      if (keys.length === 1) {
        return payload.entries[keys[0]];
      }
      return undefined;
    }
    return payload;
  }
  if (isTokenEntriesPayload(payload)) {
    return payload.entries[entryKey];
  }
  return entryKey === DEFAULT_TOKEN_KEY ? payload : undefined;
}

function mergeTokens(
  existing: TokenStorePayload | undefined,
  tokens: OAuthTokens,
  entryKey: string | undefined
): TokenStorePayload {
  if (!entryKey) {
    if (existing && isTokenEntriesPayload(existing)) {
      return {
        entries: {
          ...existing.entries,
          [DEFAULT_TOKEN_KEY]: tokens,
        },
      };
    }
    return tokens;
  }
  if (existing && isTokenEntriesPayload(existing)) {
    return {
      entries: {
        ...existing.entries,
        [entryKey]: tokens,
      },
    };
  }
  if (!existing) {
    return { entries: { [entryKey]: tokens } };
  }
  if (entryKey === DEFAULT_TOKEN_KEY) {
    return tokens;
  }
  return { entries: { [DEFAULT_TOKEN_KEY]: existing, [entryKey]: tokens } };
}

function removeTokens(
  existing: TokenStorePayload | undefined,
  entryKey: string | undefined
): TokenStorePayload | undefined {
  if (!existing) {
    return undefined;
  }
  if (!entryKey) {
    return undefined;
  }
  if (!isTokenEntriesPayload(existing)) {
    return entryKey === DEFAULT_TOKEN_KEY ? undefined : existing;
  }
  const entries = { ...existing.entries };
  delete entries[entryKey];
  const remainingKeys = Object.keys(entries);
  if (remainingKeys.length === 0) {
    return undefined;
  }
  return { entries };
}

function isTokenEntriesPayload(value: unknown): value is TokenStoreEntriesPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("entries" in value)) {
    return false;
  }
  return isRecord(value.entries);
}

function isOAuthTokens(value: unknown): value is OAuthTokens {
  if (!isRecord(value)) {
    return false;
  }
  return Object.keys(value).length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
