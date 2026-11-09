import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type { XaiAuth } from "./auth.js";
import type { XaiAccountPayload } from "./web-data.js";

const ACCOUNTS_PATH = "/api/xai/accounts";
const DELETE_PATH = "/api/xai/accounts/delete";
const LOGIN_PATH = "/api/xai/login";
const LOGIN_COMPLETE_PATH = "/api/xai/login/complete";

interface ConnectionFetch {
	register(route: {
		path: string;
		methods: readonly ("GET" | "HEAD" | "POST")[];
		requestBody: "buffered" | "streaming";
		fetch: (request: Request) => Promise<Response>;
	}): () => Promise<void>;
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

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
	const text = (await request.text()).trim();
	if (text.length === 0) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("invalid json body");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("invalid json body");
	}
	return parsed as Record<string, unknown>;
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
		if (typeof host !== "string") return "cross-origin requests are not allowed";
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

/** 注册 xAI 管理接口到 0.2.2 已鉴权的 /api Fetch 通道。 */
export function registerWebRoutes(ctx: Context, auth: XaiAuth): void {
	// SAFETY: plugin inject includes connection; this fiber already has ctx.connection.
	const connection = (
		ctx as unknown as { connection: { fetch: ConnectionFetch } }
	).connection;
	const register = (
		path: string,
		methods: readonly ("GET" | "HEAD" | "POST")[],
		fetch: (request: Request) => Promise<Response>,
	): void => {
		ctx.effect(
			() =>
				connection.fetch.register({
					path,
					methods,
					requestBody: "buffered",
					fetch,
				}),
			`dsh-xai: ${path}`,
		);
	};

		register(ACCOUNTS_PATH, ["GET"], async (request) => {
			let includeQuota = true;
			try {
				includeQuota = new URL(request.url).searchParams.get("usage") !== "0";
			} catch {
				includeQuota = true;
			}
			return jsonResponse(200, {
				accounts: (await auth.accountPayloads(
					includeQuota,
				)) satisfies XaiAccountPayload[],
				loginPending: auth.loginPending(),
			});
		});

		register(DELETE_PATH, ["POST"], async (request) => {
			let id = "";
			try {
				const body = await readJsonObject(request);
				id = typeof body.id === "string" ? body.id : "";
			} catch {
				return jsonResponse(400, { error: "invalid json body" });
			}
			if (id.length === 0 || id.includes("/")) {
				return jsonResponse(404, { error: "account not found" });
			}
			try {
				const removed = await auth.removeAccount(id);
				return jsonResponse(200, { ok: true, id: removed.id });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return jsonResponse(/was not found/.test(message) ? 404 : 500, {
					error: message,
				});
			}
		});

		register(LOGIN_PATH, ["POST"], async () => {
			try {
				const attempt = await auth.beginLogin();
				void attempt.completion.catch(() => undefined);
				let browserError: string | undefined;
				try {
					await openBrowser(attempt.url);
				} catch (error) {
					browserError =
						error instanceof Error ? error.message : String(error);
				}
				return jsonResponse(202, {
					ok: true,
					url: attempt.url,
					instructions: attempt.instructions,
					...(browserError === undefined ? {} : { browserError }),
				});
			} catch (error) {
				return jsonResponse(500, {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		});

		register(LOGIN_COMPLETE_PATH, ["POST"], async (request) => {
			try {
				const body = await readJsonObject(request);
				const paste = typeof body.paste === "string" ? body.paste : "";
				auth.submitLoginPaste(paste);
				return jsonResponse(202, { ok: true });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return jsonResponse(/not waiting for a code/.test(message) ? 409 : 400, {
					error: message,
				});
			}
		});
}
