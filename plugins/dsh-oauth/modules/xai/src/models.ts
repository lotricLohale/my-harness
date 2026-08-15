import type { Api, Model } from "@earendil-works/pi-ai";

export interface XaiModelConfig {
	id: string;
	name: string;
	reasoning: boolean;
	input: Array<"text" | "image">;
	contextWindow: number;
	maxTokens: number;
	thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
	cost: Model<Api>["cost"];
}

export const KNOWN_XAI_MODELS: readonly XaiModelConfig[] = [
	{
		id: "grok-4.6",
		name: "Grok 4.6",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
		contextWindow: 500_000,
		maxTokens: 131_072,
		thinkingLevelMap: {
			off: null,
			minimal: "low",
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
		},
	},
	{
		id: "grok-4.5",
		name: "Grok 4.5",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
		contextWindow: 500_000,
		maxTokens: 131_072,
		thinkingLevelMap: {
			off: null,
			minimal: "low",
			low: "low",
			medium: "medium",
			high: "high",
		},
	},
	{
		id: "grok-4.3",
		name: "Grok 4.3",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 131_072,
		thinkingLevelMap: {
			off: "none",
			minimal: "low",
			low: "low",
			medium: "medium",
			high: "high",
		},
	},
	{
		id: "grok-composer-2.5-fast",
		name: "Composer 2.5 Fast",
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 3, output: 15, cacheRead: 0.5, cacheWrite: 0 },
		contextWindow: 200_000,
		maxTokens: 30_000,
		thinkingLevelMap: {
			off: "none",
		},
	},
	{
		id: "grok-4.20-0309-reasoning",
		name: "Grok 4.20 Reasoning",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
		contextWindow: 2_000_000,
		maxTokens: 131_072,
	},
	{
		id: "grok-4.20-0309-non-reasoning",
		name: "Grok 4.20 Non-Reasoning",
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
		contextWindow: 2_000_000,
		maxTokens: 131_072,
	},
	{
		id: "grok-4.20-multi-agent-0309",
		name: "Grok 4.20 Multi-Agent",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
		contextWindow: 2_000_000,
		maxTokens: 131_072,
	},
	{
		id: "grok-build",
		name: "Grok Build",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1, output: 2, cacheRead: 0.2, cacheWrite: 0.2 },
		contextWindow: 512_000,
		maxTokens: 30_000,
	},
];

export const DEFAULT_XAI_MODEL = "grok-4.6";

export function findXaiModel(id: string): XaiModelConfig | undefined {
	const normalized = id.toLowerCase();
	return KNOWN_XAI_MODELS.find((m) => m.id.toLowerCase() === normalized);
}
