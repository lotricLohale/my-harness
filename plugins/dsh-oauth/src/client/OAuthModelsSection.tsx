import { useState } from "react";
import { AntigravityAccountsPanel } from "../../modules/antigravity/src/client/AntigravitySection.js";
import { XaiAccountsPanel } from "../../modules/xai/src/client/XaiSection.js";
import { OAUTH_MODULE_OPTIONS, type OAuthModuleId } from "./catalog.js";

/** 统一的 OAuth 账号设置页：用模型按钮切换账号池。 */
export function OAuthModelsSection() {
	const [model, setModel] = useState<OAuthModuleId>("antigravity");
	return (
		<section style={{ padding: 16 }}>
			<h2>模型（OAuth）</h2>
			<p>按模型切换授权账号。Token 保存在 Host credentials，不会发到浏览器。</p>
			<div
				role="tablist"
				aria-label="OAuth 模型"
				style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBlock: 12 }}
			>
				{OAUTH_MODULE_OPTIONS.map((option) => {
					const selected = option.id === model;
					return (
						<button
							key={option.id}
							type="button"
							role="tab"
							aria-selected={selected}
							onClick={() => setModel(option.id)}
							style={{
								padding: "6px 12px",
								border: selected
									? "1px solid var(--accent-color, #1677ff)"
									: "1px solid var(--border-color, #ddd)",
								background: selected
									? "var(--accent-color, #1677ff)"
									: "transparent",
								color: selected ? "#fff" : "inherit",
								cursor: "pointer",
							}}
						>
							{option.label}
						</button>
					);
				})}
			</div>
			{model === "xai" ? <XaiAccountsPanel /> : <AntigravityAccountsPanel />}
		</section>
	);
}
