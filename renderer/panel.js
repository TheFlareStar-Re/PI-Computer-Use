const $ = (id) => document.getElementById(id);

const applyAppearance = (appearance) => {
  const base = appearance?.base;
  document.documentElement.dataset.base =
    base === "light" || base === "dark"
      ? base
      : window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
};

window.pluginBridge?.on?.("appearance:changed", applyAppearance);
window.pluginBridge?.invoke("app.getAppearance").then(applyAppearance).catch(() => applyAppearance(null));

async function invoke(channel, payload) {
  if (!window.pluginBridge?.invoke) throw new Error("pluginBridge unavailable");
  return window.pluginBridge.invoke(channel, payload || {});
}

function renderProbe(state) {
  const probe = state.probe || {};
  const install = state.install || {};
  const line = $("probeLine");
  const hint = $("installHint");
  const installBtn = $("install");
  if (probe.installed) {
    line.textContent = probe.version
      ? `已安装 cua-driver ${probe.version} · ${probe.path || probe.mcpCommand || ""}`
      : `已安装 cua-driver · ${probe.path || ""}`;
    hint.hidden = true;
    installBtn.hidden = true;
  } else {
    line.textContent = "未检测到 cua-driver";
    hint.hidden = false;
    hint.textContent = `将运行官方安装脚本（从 ${install.sourceUrl || "https://cua.ai/driver/install.ps1"} 下载）。命令：${install.display || ""}`;
    installBtn.hidden = false;
  }
}

function render(state) {
  const status = state.status || "stopped";
  $("status").dataset.state = status;
  $("statusText").textContent = status;
  $("meta").textContent = [
    state.version ? `runtime ${state.version}` : null,
    state.arch,
    state.exe,
    state.lastError,
  ]
    .filter(Boolean)
    .join(" · ");
  $("allowlist").value = state.allowlist || "";
  renderProbe(state);
  const log = $("log");
  if (state.doctor?.text || state.stderrTail) {
    log.hidden = false;
    log.textContent = state.doctor?.text || state.stderrTail;
  }
  const frame = state.lastFrame;
  const img = $("frame");
  const tree = $("tree");
  if (frame?.imageDataUrl) {
    img.hidden = false;
    img.src = frame.imageDataUrl;
  } else {
    img.hidden = true;
    img.removeAttribute("src");
  }
  if (frame?.text) {
    tree.hidden = false;
    tree.textContent = frame.text;
  } else {
    tree.hidden = true;
    tree.textContent = "";
  }
  $("frameMeta").textContent = frame
    ? `${frame.app || "app"} · ${new Date(frame.at).toLocaleTimeString()}`
    : "还没有截图。Agent 调用 get_app_state 后会出现在这里。";
}

async function refresh() {
  const state = await invoke("cu.state");
  render(state);
}

function bind(id, fn) {
  $(id).addEventListener("click", async () => {
    $(id).disabled = true;
    try {
      const state = await fn();
      render(state);
    } catch (error) {
      $("log").hidden = false;
      $("log").textContent = error instanceof Error ? error.message : String(error);
    } finally {
      $(id).disabled = false;
    }
  });
}

bind("refresh", () => invoke("cu.state"));
bind("start", () => invoke("cu.start"));
bind("stop", () => invoke("cu.stop"));
bind("doctor", () => invoke("cu.doctor"));
bind("probe", () => invoke("cu.probe"));
bind("install", async () => {
  const ok = window.confirm("将从 cua.ai 下载并执行官方安装脚本。继续？");
  if (!ok) return invoke("cu.state");
  return invoke("cu.install");
});
bind("saveAllowlist", () =>
  invoke("cu.setAllowlist", { allowlist: $("allowlist").value }),
);

refresh().catch((error) => {
  $("statusText").textContent = "error";
  $("log").hidden = false;
  $("log").textContent = error instanceof Error ? error.message : String(error);
});
