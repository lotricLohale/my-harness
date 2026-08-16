import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 源码在 src/，产物在 lib/，skills/ 始终在包根。 */
export function packageRoot(from = import.meta.url): string {
	let dir = dirname(fileURLToPath(from));
	for (let i = 0; i < 4; i += 1) {
		if (existsSync(join(dir, "skills", "ponytail.md"))) return dir;
		dir = dirname(dir);
	}
	return dirname(fileURLToPath(from));
}

export function skillPath(file: string, from = import.meta.url): string {
	return join(packageRoot(from), "skills", file);
}
