import { useEffect, useState } from "react";
import { apiJson } from "../../../api-fetch.js";
import {
	formatPercent,
	shouldPollAfterLogin,
	type AntigravityAccountPayload,
	type AntigravityAccountsResponse,
} from "../web-data.js";

interface AccountsState {
	status: "loading" | "ready" | "error";
	accounts: AntigravityAccountPayload[];
	error?: string;
}

async function loadAccounts(
	includeQuota = true,
): Promise<AntigravityAccountsResponse> {
	const path = includeQuota
		? "/api/antigravity/accounts"
		: "/api/antigravity/accounts?usage=0";
	const body = await apiJson<Partial<AntigravityAccountsResponse>>(path);
	return {
		accounts: Array.isArray(body.accounts) ? body.accounts : [],
		loginPending: body.loginPending === true,
	};
}

async function deleteAccount(id: string): Promise<void> {
	await apiJson("/api/antigravity/accounts/delete", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id }),
	});
}

async function startLogin(): Promise<{ url?: string; browserError?: string }> {
	const body = await apiJson<{ url?: string; browserError?: string }>(
		"/api/antigravity/login",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		},
	);
	return { url: body.url, browserError: body.browserError };
}

function openAuthUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return;
	}
	if (parsed.protocol !== "https:" || parsed.hostname !== "accounts.google.com")
		return;
	window.open(parsed.href, "_blank", "noopener,noreferrer");
}

function resetText(value: string | undefined): string {
	if (value === undefined) return "重置时间未知";
	const time = Date.parse(value);
	return Number.isFinite(time) ? new Date(time).toLocaleString() : value;
}

export function AccountCard({
	account,
	onDelete,
	deleting,
	order,
	onMove,
	canMoveDown,
}: {
	account: AntigravityAccountPayload;
	onDelete: (id: string) => void;
	deleting: boolean;
	order?: number;
	onMove?: (direction: -1 | 1) => void;
	canMoveDown?: boolean;
}) {
	return (
		<article
			style={{
				border: "1px solid var(--border-color, #ddd)",
				borderRadius: 8,
				padding: 12,
				marginBlock: 12,
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					gap: 8,
					alignItems: "start",
				}}
			>
				<h3 style={{ margin: "0 0 8px" }}>{account.email ?? account.id}</h3>
				<div style={{ display: "flex", gap: 8 }}>
					{onMove !== undefined && (
						<>
							<button type="button" onClick={() => onMove(-1)} disabled={order === 1}>
								上移
							</button>
							<button
								type="button"
								onClick={() => onMove(1)}
								disabled={canMoveDown === false}
							>
								下移
							</button>
						</>
					)}
					<button
						type="button"
						onClick={() => onDelete(account.id)}
						disabled={deleting}
					>
						{deleting ? "删除中…" : "删除账号"}
					</button>
				</div>
			</div>
			<p style={{ margin: 0 }}>
				消耗顺序：{order ?? account.priority}；状态：
				{account.enabled ? "启用" : "停用"}；凭据：
				{account.configured ? "已配置" : "未配置"}
			</p>
			{account.expires !== undefined && (
				<p style={{ margin: "6px 0 0" }}>凭据过期：{resetText(account.expires)}</p>
			)}
			{account.exhaustedUntil !== undefined && (
				<p style={{ margin: "6px 0 0" }}>
					冷却到：{resetText(account.exhaustedUntil)}
				</p>
			)}
			{account.quotaError !== undefined && (
				<p role="alert" style={{ color: "var(--danger-color, #b00020)" }}>
					用量读取失败：{account.quotaError}
				</p>
			)}
			{(account.quota ?? []).map((group) => (
				<section
					key={group.displayName}
					aria-label={group.displayName}
					style={{ marginTop: 10 }}
				>
					<strong>{group.displayName}</strong>
					<div style={{ display: "grid", gap: 6, marginTop: 6 }}>
						{group.buckets.map((bucket) => (
							<div key={`${group.displayName}:${bucket.displayName}`}>
								<span>
									{bucket.displayName}：{formatPercent(bucket.remainingFraction)} 剩余
								</span>
								<small style={{ display: "block" }}>
									重置：{resetText(bucket.resetTime)}
								</small>
							</div>
						))}
					</div>
				</section>
			))}
		</article>
	);
}

export function AntigravityAccountsPanel() {
	const [state, setState] = useState<AccountsState>({
		status: "loading",
		accounts: [],
	});
	const [loginState, setLoginState] = useState<
		"idle" | "starting" | "waiting" | "done" | "error"
	>("idle");
	const [loginError, setLoginError] = useState<string | undefined>();
	const [loginUrl, setLoginUrl] = useState<string | undefined>();
	const [deletingId, setDeletingId] = useState<string | undefined>();
	const [deleteError, setDeleteError] = useState<string | undefined>();

	const refresh = async (
		includeQuota = true,
	): Promise<AntigravityAccountsResponse | undefined> => {
		try {
			if (includeQuota)
				setState((previous) => ({ ...previous, status: "loading" }));
			const response = await loadAccounts(includeQuota);
			setState({ status: "ready", accounts: response.accounts });
			return response;
		} catch (error) {
			setState({
				status: "error",
				accounts: [],
				error: error instanceof Error ? error.message : String(error),
			});
			return undefined;
		}
	};

	useEffect(() => {
		void refresh();
	}, []);
	useEffect(() => {
		if (!shouldPollAfterLogin(loginState)) return undefined;
		let count = 0;
		const timer = window.setInterval(() => {
			count += 1;
			void refresh(false).then((response) => {
				if (response !== undefined && !response.loginPending) {
					window.clearInterval(timer);
					setLoginState("done");
					void refresh();
				}
			});
			if (count >= 60) {
				window.clearInterval(timer);
				setLoginState("done");
			}
		}, 2000);
		return () => {
			window.clearInterval(timer);
		};
	}, [loginState]);

	const onMove = async (index: number, direction: -1 | 1): Promise<void> => {
		const ids = state.accounts.map((account) => account.id);
		const next = index + direction;
		if (next < 0 || next >= ids.length) return;
		const swapped = [...ids];
		const current = swapped[index];
		const neighbor = swapped[next];
		if (current === undefined || neighbor === undefined) return;
		swapped[index] = neighbor;
		swapped[next] = current;
		setDeleteError(undefined);
		try {
			await apiJson("/api/antigravity/accounts/order", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ids: swapped }),
			});
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : String(error));
			return;
		}
		await refresh(false);
	};

	const onDelete = async (id: string): Promise<void> => {
		if (deletingId !== undefined) return;
		setDeletingId(id);
		setDeleteError(undefined);
		try {
			await deleteAccount(id);
			await refresh();
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : String(error));
		} finally {
			setDeletingId(undefined);
		}
	};

	const onLogin = async (): Promise<void> => {
		setLoginState("starting");
		setLoginError(undefined);
		setLoginUrl(undefined);
		try {
			const started = await startLogin();
			setLoginUrl(started.url);
			setLoginError(started.browserError);
			setLoginState("waiting");
		} catch (error) {
			setLoginState("error");
			setLoginError(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<section>
			<h3 style={{ marginTop: 0 }}>Antigravity (OAuth)</h3>
			<p>
				账号、五小时/每周额度和授权状态。靠前的账号先消耗，可用上移/下移调整。Token
				只保存在 Host credentials，不会发送到浏览器。
			</p>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				<button
					type="button"
					onClick={() => void onLogin()}
					disabled={loginState === "starting" || loginState === "waiting"}
				>
					添加账号
				</button>
				<button
					type="button"
					onClick={() => void refresh()}
					disabled={state.status === "loading"}
				>
					刷新用量
				</button>
			</div>
			{loginState === "waiting" && (
				<p role="status">已打开浏览器，等待授权完成…</p>
			)}
			{loginUrl !== undefined && (
				<p>
					<button type="button" onClick={() => openAuthUrl(loginUrl)}>
						打开授权页面
					</button>
				</p>
			)}
			{loginError !== undefined && (
				<p role="alert">
					{loginState === "error"
						? "添加账号失败"
						: "系统浏览器打开失败，请点击授权链接"}
					：{loginError}
				</p>
			)}
			{state.status === "loading" && <p>加载中…</p>}
			{state.status === "error" && <p role="alert">加载失败：{state.error}</p>}
			{deleteError !== undefined && (
				<p role="alert">删除账号失败：{deleteError}</p>
			)}
			{state.status === "ready" && state.accounts.length === 0 && (
				<p>还没有账号，请点击“添加账号”。</p>
			)}
			{state.accounts.map((account, index) => (
				<AccountCard
					key={account.id}
					account={account}
					order={index + 1}
					canMoveDown={index + 1 < state.accounts.length}
					onMove={(direction) => void onMove(index, direction)}
					onDelete={(id) => void onDelete(id)}
					deleting={deletingId === account.id}
				/>
			))}
		</section>
	);
}
