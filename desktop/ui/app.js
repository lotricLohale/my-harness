const invoke = window.__TAURI__.core.invoke;
const statusText = document.querySelector("#status");
const urlText = document.querySelector("#url");
const dot = document.querySelector("#dot");
const openButton = document.querySelector("#open");
const checkButton = document.querySelector("#check");
const message = document.querySelector("#message");

async function refresh() {
	try {
		const state = await invoke("harness_status");
		statusText.textContent =
			state.status === "ready" ? "Harness 已就绪" : `Harness：${state.status}`;
		urlText.textContent = state.url ?? "";
		dot.className = `dot ${state.status === "ready" ? "ready" : state.status.startsWith("failed") || state.status.startsWith("exited") ? "failed" : ""}`;
		openButton.disabled = state.status !== "ready";
	} catch (error) {
		statusText.textContent = "无法读取 Harness 状态";
		message.textContent = String(error);
		dot.className = "dot failed";
	}
}

openButton.addEventListener("click", async () => {
	message.textContent = "";
	try {
		await invoke("open_harness");
	} catch (error) {
		message.textContent = String(error);
	}
});

checkButton.addEventListener("click", async () => {
	checkButton.disabled = true;
	message.textContent = "正在检查 origin/master…";
	try {
		const result = await invoke("check_core_update");
		message.textContent = result.updateAvailable
			? `发现更新\n当前：${result.current}\n最新：${result.latest}\n退出应用后运行 pnpm core:update。`
			: `核心已是最新版本\n${result.current}`;
	} catch (error) {
		message.textContent = String(error);
	} finally {
		checkButton.disabled = false;
	}
});

setInterval(refresh, 1000);
void refresh();
