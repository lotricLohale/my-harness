export const OAUTH_MODULE_IDS = ["antigravity", "xai"] as const;

export type OAuthModuleId = (typeof OAUTH_MODULE_IDS)[number];

export const OAUTH_MODULE_OPTIONS: Array<{ id: OAuthModuleId; label: string }> =
	[
		{ id: "antigravity", label: "Antigravity (OAuth)" },
		{ id: "xai", label: "xAI (OAuth)" },
	];
