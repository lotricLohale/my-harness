import type { ReactNode } from "react";

export type OAuthModelKind = "antigravity" | "xai";

const OPTIONS: Array<{ id: OAuthModelKind; label: string }> = [
	{ id: "antigravity", label: "Antigravity (OAuth)" },
	{ id: "xai", label: "xAI (OAuth)" },
];

/** 统一的 OAuth 账号设置页外壳：用模型选项切换账号池。 */
export function OAuthModelsSection({
	model,
	onModelChange,
	children,
}: {
	model: OAuthModelKind;
	onModelChange?: (model: OAuthModelKind) => void;
	children: ReactNode;
}) {
	return (
		<section style={{ padding: 16 }}>
			<h2>模型（OAuth）</h2>
			<p>按模型切换授权账号。Token 保存在 Host credentials，不会发到浏览器。</p>
			<label style={{ display: "block", marginBlock: 12 }}>
				<span style={{ marginRight: 8 }}>模型</span>
				<select
					value={model}
					onChange={(event) =>
						onModelChange?.(event.target.value as OAuthModelKind)
					}
					disabled={onModelChange === undefined}
				>
					{OPTIONS.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label}
						</option>
					))}
				</select>
			</label>
			{children}
		</section>
	);
}
