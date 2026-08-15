import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type { AntigravityAuth } from "./auth.js";
import type { AntigravityAccountPayload } from "./web-data.js";

const ACCOUNTS_PATH = "/api/antigravity/accounts";
const ACCOUNT_PATH_PREFIX = "/api/antigravity/accounts/";
const LOGIN_PATH = "/api/antigravity/login";

interface WebRoute {
	kind: "exact" | "prefix";
	path: string;
	handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}

interface WebServerLike {
	register(route: WebRoute): () => void;
}

/** 打开系统浏览器。 */
export function openBrowser(url: string): Promise<void> {
	const [command, args] =
		process.platform === "darwin"
			? ["/usr/bin/open", [url]]
			: process.platform === "win32"
				? ["rundll32", ["url.dll,FileProtocolHandler", url]]
				: ["xdg-open", [url]];
	return new Promise((resolve, reject) => {
		execFile(command, args, (error) =>
			error === null ? resolve() : reject(error),
		);
	});
}

/** 写 JSON 响应。 */
export function writeJson(
	res: Pick<ServerResponse, "writeHead" | "end">,
	status: number,
	body: unknown,
): void {
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	res.end(JSON.stringify(body));
}

/** 拒绝跨站请求。 */
export function assertSameOrigin(
	req: Pick<IncomingMessage, "headers">,
): string | undefined {
	if (req.headers["sec-fetch-site"] === "cross-site")
		return "cross-site requests are not allowed";
	const origin = req.headers.origin;
	if (typeof origin === "string") {
		const host = req.headers.host;
		if (typeof host !== "string")
			return "cross-origin requests are not allowed";
		try {
			if (new URL(origin).host !== host)
				return "cross-origin requests are not allowed";
		} catch {
			return "invalid origin header";
		}
	}
	return undefined;
}

/** POST 只接受同源 JSON，避免浏览器跨站表单触发登录。 */
export function assertSameOriginJson(
	req: Pick<IncomingMessage, "headers">,
): string | undefined {
	const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
	if (!contentType.startsWith("application/json"))
		return "content-type must be application/json";
	return assertSameOrigin(req);
}

/** 读空 JSON body；当前登录接口不需要参数，但仍要求 JSON。 */
async function readJson(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	const text = Buffer.concat(chunks).toString("utf8").trim();
	if (text.length === 0) return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("invalid json body");
	}
}

/** 注册 Antigravity 同源管理接口，随 fiber 自动卸载。 */
export function registerWebRoutes(ctx: Context, auth: AntigravityAuth): void {
	ctx.inject(["webServer"], (wctx) => {
		const webServer = (wctx as unknown as { webServer: WebServerLike })
			.webServer;
		const accountRoute: WebRoute = {
			kind: "exact",
			path: ACCOUNTS_PATH,
			handler: async (req, res) => {
				if (req.method !== "GET") {
					writeJson(res, 405, { error: "method not allowed" });
					return;
				}
				const includeQuota =
					new URL(
						req.url ?? ACCOUNTS_PATH,
						"http://localhost",
					).searchParams.get("usage") !== "0";
				writeJson(res, 200, {
					accounts: (await auth.accountPayloads(
						includeQuota,
					)) satisfies AntigravityAccountPayload[],
					loginPending: auth.loginPending(),
				});
			},
		};
		const deleteRoute: WebRoute = {
			kind: "prefix",
			path: ACCOUNT_PATH_PREFIX,
			handler: async (req, res) => {
				if (req.method !== "DELETE") {
					writeJson(res, 405, { error: "method not allowed" });
					return;
				}
				const rejected = assertSameOrigin(req);
				if (rejected !== undefined) {
					writeJson(res, 403, { error: rejected });
					return;
				}
				const pathname = new URL(
					req.url ?? ACCOUNT_PATH_PREFIX,
					"http://localhost",
				).pathname;
				if (!pathname.startsWith(ACCOUNT_PATH_PREFIX)) {
					writeJson(res, 404, { error: "account not found" });
					return;
				}
				const id = decodeURIComponent(
					pathname.slice(ACCOUNT_PATH_PREFIX.length),
				).replace(/\/$/, "");
				if (id.length === 0 || id.includes("/")) {
					writeJson(res, 404, { error: "account not found" });
					return;
				}
				try {
					const removed = await auth.removeAccount(id);
					writeJson(res, 200, { ok: true, id: removed.id });
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					writeJson(res, /was not found/.test(message) ? 404 : 500, {
						error: message,
					});
				}
			},
		};
		const loginRoute: WebRoute = {
			kind: "exact",
			path: LOGIN_PATH,
			handler: async (req, res) => {
				if (req.method !== "POST") {
					writeJson(res, 405, { error: "method not allowed" });
					return;
				}
				const rejected = assertSameOriginJson(req);
				if (rejected !== undefined) {
					writeJson(res, 415, { error: rejected });
					return;
				}
				try {
					await readJson(req);
					const attempt = await auth.beginLogin();
					void attempt.completion.catch(() => undefined);
					let browserError: string | undefined;
					try {
						await openBrowser(attempt.url);
					} catch (error) {
						browserError =
							error instanceof Error ? error.message : String(error);
					}
					writeJson(res, 202, {
						ok: true,
						url: attempt.url,
						instructions: attempt.instructions,
						...(browserError === undefined ? {} : { browserError }),
					});
				} catch (error) {
					writeJson(res, 500, {
						error: error instanceof Error ? error.message : String(error),
					});
				}
			},
		};
		ctx.effect(() => {
			const disposeAccounts = webServer.register(accountRoute);
			const disposeDelete = webServer.register(deleteRoute);
			const disposeLogin = webServer.register(loginRoute);
			return () => {
				disposeLogin();
				disposeDelete();
				disposeAccounts();
			};
		}, "dsh-antigravity: web routes");
	});
}
