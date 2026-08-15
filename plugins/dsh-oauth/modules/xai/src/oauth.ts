import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type {
	OAuthCredentials,
	OAuthLoginCallbacks,
} from "@earendil-works/pi-ai";

export const XAI_OAUTH_ISSUER = "https://auth.x.ai";
export const XAI_OAUTH_AUTHORIZATION_URL = "https://auth.x.ai/oauth2/authorize";
export const XAI_OAUTH_TOKEN_URL = "https://auth.x.ai/oauth2/token";
export const XAI_OAUTH_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const XAI_OAUTH_SCOPE =
	"openid profile email offline_access grok-cli:access api:access conversations:read conversations:write";
export const XAI_OAUTH_REDIRECT_HOST = "127.0.0.1";
export const XAI_OAUTH_REDIRECT_PORT = 56121;
export const XAI_OAUTH_REDIRECT_PATH = "/callback";
export const XAI_OAUTH_REFRESH_SKEW_MS = 2 * 60 * 1000;

export interface XaiTokenPayload {
	access_token?: string;
	refresh_token?: string;
	id_token?: string;
	expires_in?: number;
	token_type?: string;
}

interface CallbackResult {
	code?: string;
	state?: string;
	error?: string;
}

export function pkcePair(): { verifier: string; challenge: string } {
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
	const parts = token.split(".");
	if (parts.length !== 3 || !parts[1]) return {};
	try {
		const payload = Buffer.from(parts[1], "base64url").toString("utf8");
		const parsed = JSON.parse(payload) as unknown;
		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function extractIdentityFromIdToken(idToken?: string): {
	email?: string;
	username?: string;
} {
	if (!idToken) return {};
	const payload = decodeJwtPayload(idToken);
	const email =
		typeof payload.email === "string" && payload.email.length > 0
			? payload.email
			: undefined;

	let username: string | undefined;
	if (
		typeof payload.preferred_username === "string" &&
		payload.preferred_username.length > 0
	) {
		username = payload.preferred_username;
	} else if (typeof payload.name === "string" && payload.name.length > 0) {
		username = payload.name;
	} else if (typeof payload.sub === "string" && payload.sub.length > 0) {
		username = payload.sub;
	}

	return { email, username };
}

async function startCallbackServer(expectedState: string): Promise<{
	redirectUri: string;
	waitForCallback: (signal?: AbortSignal) => Promise<CallbackResult>;
	resolveCallback: (result: CallbackResult) => void;
	close: () => void;
}> {
	let resolveCallback!: (result: CallbackResult) => void;
	const callbackPromise = new Promise<CallbackResult>((resolve) => {
		resolveCallback = resolve;
	});

	const makeServer = () =>
		createServer((req, res) => {
			const url = new URL(req.url ?? "/", `http://${XAI_OAUTH_REDIRECT_HOST}`);
			if (url.pathname !== XAI_OAUTH_REDIRECT_PATH) {
				res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
				res.end("Not found");
				return;
			}

			const result: CallbackResult = {
				code: url.searchParams.get("code") ?? undefined,
				state: url.searchParams.get("state") ?? undefined,
				error: url.searchParams.get("error") ?? undefined,
			};

			if (result.state !== expectedState) {
				res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
				res.end(
					"<html><body><h2>xAI 授权状态不匹配，请关闭此页面并在 DeepSeek Harness 中重试。</h2></body></html>",
				);
				return;
			}

			resolveCallback(result);

			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(
				result.error
					? `<html><body><h2>xAI 授权失败：${result.error}</h2><p>您可以关闭此标签页。</p></body></html>`
					: "<html><body><h2>xAI 授权成功！</h2><p>您可以关闭此标签页并返回 DeepSeek Harness。</p></body></html>",
			);
		});

	const listen = (port: number): Promise<Server> =>
		new Promise((resolve, reject) => {
			const server = makeServer();
			server.once("error", reject);
			server.listen(port, XAI_OAUTH_REDIRECT_HOST, () => {
				server.removeListener("error", reject);
				resolve(server);
			});
		});

	let server: Server;
	try {
		server = await listen(XAI_OAUTH_REDIRECT_PORT);
	} catch {
		server = await listen(0);
	}

	const address = server.address();
	if (!address || typeof address === "string") {
		server.close();
		throw new Error("Could not determine xAI OAuth callback port");
	}

	const redirectUri = `http://${XAI_OAUTH_REDIRECT_HOST}:${address.port}${XAI_OAUTH_REDIRECT_PATH}`;

	const close = () => {
		try {
			server.close();
		} catch {
			// ignore
		}
	};

	return {
		redirectUri,
		close,
		resolveCallback,
		waitForCallback: async (signal?: AbortSignal) => {
			let timer: NodeJS.Timeout | undefined;
			let abortHandler: (() => void) | undefined;
			const timeout = new Promise<CallbackResult>((_, reject) => {
				if (signal?.aborted) {
					reject(new Error("Login cancelled"));
					return;
				}
				timer = setTimeout(
					() => reject(new Error("Timed out waiting for xAI OAuth callback")),
					180_000,
				);
				abortHandler = () => {
					if (timer) clearTimeout(timer);
					reject(new Error("Login cancelled"));
				};
				signal?.addEventListener("abort", abortHandler, { once: true });
			});

			try {
				return await Promise.race([callbackPromise, timeout]);
			} finally {
				if (timer) clearTimeout(timer);
				if (abortHandler) signal?.removeEventListener("abort", abortHandler);
				close();
			}
		},
	};
}

export function buildAuthorizeUrl(
	redirectUri: string,
	challenge: string,
	state: string,
	nonce: string,
): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: XAI_OAUTH_CLIENT_ID,
		redirect_uri: redirectUri,
		scope: XAI_OAUTH_SCOPE,
		code_challenge: challenge,
		code_challenge_method: "S256",
		state,
		nonce,
	});
	return `${XAI_OAUTH_AUTHORIZATION_URL}?${params.toString()}`;
}

export async function exchangeXaiToken(
	tokenEndpoint: string,
	body: Record<string, string>,
	signal?: AbortSignal,
): Promise<XaiTokenPayload> {
	const response = await fetch(tokenEndpoint, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent": "dsh-xai/0.1.0",
			"X-Grok-Client-Version": "1.5.0",
			"X-Grok-Client-Surface": "cli",
		},
		body: new URLSearchParams(body).toString(),
		redirect: "error",
		signal,
	});

	if (!response.ok) {
		throw new Error(`xAI token request failed with status ${response.status}`);
	}

	const payload = (await response.json()) as unknown;
	if (
		typeof payload !== "object" ||
		payload === null ||
		Array.isArray(payload)
	) {
		throw new Error("xAI token response returned invalid JSON");
	}
	return payload as XaiTokenPayload;
}

export function credentialsFromTokenPayload(
	data: XaiTokenPayload,
	tokenEndpoint: string,
	fallbackRefresh = "",
): OAuthCredentials {
	if (typeof data.access_token !== "string" || !data.access_token) {
		throw new Error("xAI token response did not include an access token");
	}

	const refresh =
		typeof data.refresh_token === "string" && data.refresh_token
			? data.refresh_token
			: fallbackRefresh;
	if (!refresh) {
		throw new Error("xAI token response did not include a refresh token");
	}

	const expiresIn =
		typeof data.expires_in === "number" &&
		Number.isFinite(data.expires_in) &&
		data.expires_in > 0
			? data.expires_in
			: 3600;

	const identity = extractIdentityFromIdToken(data.id_token);

	return {
		refresh,
		access: data.access_token,
		expires: Date.now() + expiresIn * 1000 - XAI_OAUTH_REFRESH_SKEW_MS,
		tokenEndpoint,
		idToken: data.id_token,
		tokenType:
			typeof data.token_type === "string" && data.token_type
				? data.token_type
				: "Bearer",
		...(identity.email ? { email: identity.email } : {}),
		...(identity.username ? { username: identity.username } : {}),
	};
}

export interface XaiOAuthService {
	login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
	refreshToken(
		credentials: OAuthCredentials,
		signal?: AbortSignal,
	): Promise<OAuthCredentials>;
	getApiKey(credentials: OAuthCredentials): string;
}

export function createXaiOAuth(): XaiOAuthService {
	return {
		async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
			const { verifier, challenge } = pkcePair();
			const state = randomUUID().replace(/-/g, "");
			const nonce = randomUUID().replace(/-/g, "");
			const callbackServer = await startCallbackServer(state);

			let callback: CallbackResult;
			try {
				const authorizeUrl = buildAuthorizeUrl(
					callbackServer.redirectUri,
					challenge,
					state,
					nonce,
				);
				callbacks.onAuth({
					url: authorizeUrl,
					instructions: "在系统浏览器中完成 xAI (Grok) 授权登录。",
				});

				callback = await callbackServer.waitForCallback(callbacks.signal);
			} finally {
				callbackServer.close();
			}

			if (callback.state !== state) {
				throw new Error("xAI authorization failed: state mismatch");
			}
			if (callback.error) {
				throw new Error(`xAI authorization failed: ${callback.error}`);
			}
			if (!callback.code) {
				throw new Error(
					"xAI authorization failed: no authorization code returned",
				);
			}

			const data = await exchangeXaiToken(
				XAI_OAUTH_TOKEN_URL,
				{
					grant_type: "authorization_code",
					code: callback.code,
					redirect_uri: callbackServer.redirectUri,
					client_id: XAI_OAUTH_CLIENT_ID,
					code_verifier: verifier,
				},
				callbacks.signal,
			);

			return credentialsFromTokenPayload(data, XAI_OAUTH_TOKEN_URL);
		},

		async refreshToken(
			credentials: OAuthCredentials,
			signal?: AbortSignal,
		): Promise<OAuthCredentials> {
			if (!credentials.refresh) {
				throw new Error(
					"xAI credentials are expired and do not include a refresh token",
				);
			}

			const tokenEndpoint =
				typeof credentials["tokenEndpoint"] === "string" &&
				credentials["tokenEndpoint"]
					? credentials["tokenEndpoint"]
					: XAI_OAUTH_TOKEN_URL;
			const data = await exchangeXaiToken(
				tokenEndpoint,
				{
					grant_type: "refresh_token",
					refresh_token: credentials.refresh,
					client_id: XAI_OAUTH_CLIENT_ID,
				},
				signal,
			);

			return credentialsFromTokenPayload(
				data,
				tokenEndpoint,
				credentials.refresh,
			);
		},

		getApiKey(credentials: OAuthCredentials): string {
			return credentials.access;
		},
	};
}
