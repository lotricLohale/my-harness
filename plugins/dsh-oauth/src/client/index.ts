import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import { OAuthModelsSection } from "./OAuthModelsSection.js";

export const inject = ["slots"];

/** 隐藏 UI 插件自带的检查更新按钮。 */
function injectHideUpdateStyle(): () => void {
	if (typeof document === "undefined") return () => {};
	const style = document.createElement("style");
	style.setAttribute("data-dsh-hide-update-trigger", "");
	style.textContent = `
    button[aria-label="检查更新"],
    button[aria-label="Check for updates"],
    button[title="检查更新"],
    button[title="Check for updates"] {
      display: none !important;
    }
  `;
	const target = document.head || document.documentElement;
	target?.appendChild(style);
	return () => {
		style.remove();
	};
}

/** 注册统一的「模型（OAuth）」设置页。 */
export function apply(ctx: ClientContext): void {
	ctx.slots.inject("settings.section", () =>
		ctx.slots.register(
			{
				name: "settings.section",
				id: "oauth-models",
				order: 11,
				label: () => "模型（OAuth）",
			},
			OAuthModelsSection,
		),
	);
	ctx.effect(() => injectHideUpdateStyle());
}

export { OAuthModelsSection } from "./OAuthModelsSection.js";
