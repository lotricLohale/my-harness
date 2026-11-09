export type ApiJson = { readonly [key: string]: unknown };

/** Decode a browser API object. Safari throws a pattern error on JSON.parse("unauthorized"). */
export function decodeApiBody(text: string, status: number): ApiJson {
	const trimmed = text.trim();
	try {
		const parsed: unknown = trimmed.length === 0 ? {} : JSON.parse(trimmed);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as ApiJson;
		}
		throw new Error(trimmed || `HTTP ${status}`);
	} catch (error) {
		if (error instanceof Error && error.message === trimmed) throw error;
		throw new Error(trimmed || `HTTP ${status}`);
	}
}

/** Same-origin /api call that sends the DSH browser cookie. */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
	const headers = new Headers(init?.headers);
	if (!headers.has("Accept")) headers.set("Accept", "application/json");
	const res = await fetch(path, { credentials: "include", ...init, headers });
	const text = await res.text();
	const body = decodeApiBody(text, res.status);
	if (!res.ok) {
		const error = typeof body.error === "string" ? body.error : text.trim();
		throw new Error(error || `HTTP ${res.status}`);
	}
	return body as T;
}
