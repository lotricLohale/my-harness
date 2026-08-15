import { useEffect, useState } from "react";
import {
	formatPercent,
	shouldPollAfterLogin,
	type XaiAccountPayload,
	type XaiAccountsResponse,
} from "../web-data.js";

interface AccountsState {
	status: "loading" | "ready" | "error";
	accounts: XaiAccountPayload[];
	error?: string;
}

async function loadAccounts(includeQuota = true): Promise<XaiAccountsResponse> {
	const path = includeQuota ? "/api/xai/accounts" : "/api/xai/accounts?usage=0";
	const res = await fetch(path, { headers: { Accept: "application/json" } });
	const body = (await res.json()) as Partial<XaiAccountsResponse> & {
		error?: string;
	};
	if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
	return {
		accounts: Array.isArray(body.accounts) ? body.accounts : [],
		loginPending: body.loginPending === true,
	};
}

async function deleteAccount(id: string): Promise<void> {
	const res = await fetch(`/api/xai/accounts/${encodeURIComponent(id)}`, {
		method: "DELETE",
		headers: { Accept: "application/json" },
	});
	const body = (await res.json()) as { error?: string };
	if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
}

async function startLogin(): Promise<{ url?: string; browserError?: string }> {
	const res = await fetch("/api/xai/login", {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: "{}",
	});
	const body = (await res.json()) as {
		error?: string;
		url?: string;
		browserError?: string;
	};
	if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
	return { url: body.url, browserError: body.browserError };
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
}: {
	account: XaiAccountPayload;
	onDelete: (id: string) => void;
	deleting: boolean;
}) {
	const displayName = account.email ?? account.username ?? account.id;
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
				<h3 style={{ margin: "0 0 8px" }}>{displayName}</h3>
				<button
					type="button"
					onClick={() => onDelete(account.id)}
					disabled={deleting}
				>
					{deleting ? "删除中…" : "删除账号"}
				</button>
			</div>
			<p style={{ margin: 0 }}>
				状态：{account.enabled ? "启用" : "停用"}；优先级：{account.priority}
				；凭据：{account.configured ? "已配置" : "未配置"}
			</p>
			{account.expires !== undefined && (
				<p style={{ margin: "6px 0 0" }}>
					凭据过期：{resetText(account.expires)}
				</p>
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
									{bucket.displayName}：
									{bucket.detail ?? formatPercent(bucket.remainingFraction)}
								</span>
								{bucket.resetTime !== undefined && (
									<small style={{ display: "block" }}>
										重置：{resetText(bucket.resetTime)}
									</small>
								)}
							</div>
						))}
					</div>
				</section>
			))}
		</article>
	);
}

export function XaiAccountsPanel() {
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
	): Promise<XaiAccountsResponse | undefined> => {
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
			<h3 style={{ marginTop: 0 }}>xAI (OAuth)</h3>
			<p>
				多账号管理、月度额度与授权状态。Token 保存在 Host credentials
				中，支持限额自动故障转移。
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
					<button type="button" onClick={() => window.open(loginUrl, "_blank")}>
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
			{state.accounts.map((account) => (
				<AccountCard
					key={account.id}
					account={account}
					onDelete={(id) => void onDelete(id)}
					deleting={deletingId === account.id}
				/>
			))}
		</section>
	);
}
