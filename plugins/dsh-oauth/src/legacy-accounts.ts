import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface LegacyOauthAccount {
	id: string;
	email?: string;
	username?: string;
	credentialRef: string;
	enabled?: boolean;
	priority?: number;
	exhaustedUntil?: number;
}

export interface LegacyOauthAccounts {
	antigravity: LegacyOauthAccount[];
	xai: LegacyOauthAccount[];
}

function importedSettingsCandidates(): string[] {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	return [
		join(home, "settings.yaml.imported"),
		join(home, "settings.yaml"),
	];
}

function parseScalar(raw: string): string | number | boolean {
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (/^-?\d+$/.test(raw)) return Number(raw);
	return raw.replace(/^['"]|['"]$/g, "");
}

function parseAccountList(section: string): LegacyOauthAccount[] {
	const accounts: LegacyOauthAccount[] = [];
	let current: Record<string, string | number | boolean> | undefined;
	const flush = (): void => {
		if (current === undefined) return;
		const id = current.id;
		const credentialRef = current.credentialRef;
		if (typeof id !== "string" || typeof credentialRef !== "string") return;
		accounts.push({
			id,
			credentialRef,
			...(typeof current.email === "string" ? { email: current.email } : {}),
			...(typeof current.username === "string"
				? { username: current.username }
				: {}),
			...(typeof current.enabled === "boolean"
				? { enabled: current.enabled }
				: {}),
			...(typeof current.priority === "number"
				? { priority: current.priority }
				: {}),
			...(typeof current.exhaustedUntil === "number"
				? { exhaustedUntil: current.exhaustedUntil }
				: {}),
		});
	};
	for (const line of section.split("\n")) {
		const item = line.match(/^\s+-\s+id:\s+(\S+)\s*$/);
		if (item?.[1] !== undefined) {
			flush();
			current = { id: parseScalar(item[1]) };
			continue;
		}
		const field = line.match(/^\s{6}([A-Za-z]+):\s+(.+?)\s*$/);
		if (field?.[1] !== undefined && field[2] !== undefined && current) {
			current[field[1]] = parseScalar(field[2]);
		}
	}
	flush();
	return accounts;
}

function sectionBody(text: string, name: string): string {
	const lines = text.split("\n");
	const start = lines.findIndex((line) => line === `${name}:`);
	if (start < 0) return "";
	const body: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t")) break;
		body.push(line);
	}
	return body.join("\n");
}

/** Parse 0.1 `settings.yaml` OAuth account pools. */
export function parseLegacyOauthAccounts(text: string): LegacyOauthAccounts {
	return {
		antigravity: parseAccountList(sectionBody(text, "llm-antigravity")),
		xai: parseAccountList(sectionBody(text, "llm-xai")),
	};
}

export function loadLegacyOauthAccounts(): LegacyOauthAccounts {
	const empty = { antigravity: [], xai: [] };
	const path = importedSettingsCandidates().find((candidate) =>
		existsSync(candidate),
	);
	if (path === undefined) return empty;
	try {
		return parseLegacyOauthAccounts(readFileSync(path, "utf8"));
	} catch {
		return empty;
	}
}

export function withLegacyOauthAccounts(
	config: {
		antigravity?: object;
		xai?: object;
	},
	legacy: LegacyOauthAccounts,
): { antigravity?: object; xai?: object; migrated: boolean } {
	const antigravity = { ...(config.antigravity ?? {}) } as {
		accounts?: unknown;
	};
	const xai = { ...(config.xai ?? {}) } as { accounts?: unknown };
	let migrated = false;
	if (
		!Array.isArray(antigravity.accounts) ||
		antigravity.accounts.length === 0
	) {
		if (legacy.antigravity.length > 0) {
			antigravity.accounts = legacy.antigravity;
			migrated = true;
		}
	}
	if (!Array.isArray(xai.accounts) || xai.accounts.length === 0) {
		if (legacy.xai.length > 0) {
			xai.accounts = legacy.xai;
			migrated = true;
		}
	}
	return { antigravity, xai, migrated };
}
