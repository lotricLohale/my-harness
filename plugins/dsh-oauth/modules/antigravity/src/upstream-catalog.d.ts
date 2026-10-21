export function discoverAntigravityModels(
	apiKey: string,
	signal?: AbortSignal,
): Promise<{
	models: Array<{
		id: string;
		name: string;
		reasoning: boolean;
		input: Array<"text" | "image">;
		contextWindow: number;
		maxTokens: number;
		thinkingLevelMap?: unknown;
		cost?: unknown;
	}>;
	routing: Record<string, unknown>;
}>;
export function applyAntigravityCatalog(catalog: {
	models: unknown[];
	routing: Record<string, unknown>;
}): void;
