import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Tray toggle written by MDSH. Missing or unreadable means off. */
export function autoRetryEnabled(): boolean {
	try {
		return (
			readFileSync(join(homedir(), ".dsh", "mdsh-auto-retry"), "utf8").trim() ===
			"1"
		);
	} catch {
		return false;
	}
}
