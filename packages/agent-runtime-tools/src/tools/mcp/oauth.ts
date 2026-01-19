/**
 * MCP OAuth Helpers
 *
 * Minimal OAuth client provider and token store integration for MCP SDK transports.
 */

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
  private tokens?: OAuthTokens;

  async getTokens(): Promise<OAuthTokens | undefined> {
    return this.tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.tokens = tokens;
  }

  async clear(): Promise<void> {
    this.tokens = undefined;
  }
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
