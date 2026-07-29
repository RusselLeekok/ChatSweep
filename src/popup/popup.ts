import { BUILD_VERSION } from "../version";

const statusElement = document.querySelector<HTMLDivElement>("#status");
const openButton = document.querySelector<HTMLButtonElement>("#open");
let primaryAction: "open" | "reload" = "open";

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function sendToTab<T>(
  tab: chrome.tabs.Tab | null,
  message: unknown
): Promise<T | null> {
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, message) as T;
  } catch {
    return null;
  }
}

function isSupportedUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return [
      "chatgpt.com",
      "chat.openai.com",
      "grok.com",
      "gemini.google.com",
      "chat.deepseek.com",
      "www.doubao.com",
      "doubao.com"
    ].includes(hostname);
  } catch {
    return false;
  }
}

async function injectIntoTab(tab: chrome.tabs.Tab): Promise<boolean> {
  if (!tab.id || !isSupportedUrl(tab.url)) return false;
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    return true;
  } catch {
    return false;
  }
}

async function readPageVersion(
  tab: chrome.tabs.Tab
): Promise<{ present: boolean; version: string | null } | null> {
  if (!tab.id || !isSupportedUrl(tab.url)) return null;
  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const root = document.getElementById("chattidy-root");
        return {
          present: Boolean(root),
          version: root?.getAttribute("data-chattidy-version") ?? null
        };
      }
    });
    return execution?.result ?? null;
  } catch {
    return null;
  }
}

async function reloadStalePage(tab: chrome.tabs.Tab): Promise<boolean> {
  const pageVersion = await readPageVersion(tab);
  if (!pageVersion?.present || pageVersion.version === BUILD_VERSION || !tab.id) {
    return false;
  }

  if (statusElement) {
    statusElement.textContent = `检测到旧版 ${pageVersion.version ?? "页面脚本"}，正在切换到 v${BUILD_VERSION}…`;
  }
  if (openButton) openButton.disabled = true;
  await chrome.tabs.reload(tab.id);
  window.setTimeout(() => window.close(), 350);
  return true;
}

async function initialize(): Promise<void> {
  const tab = await getActiveTab();
  if (tab && await reloadStalePage(tab)) return;

  type StatusResponse = {
    ok: boolean;
    buildVersion?: string;
    report?: {
      adapterLabel: string;
      conversationCount: number;
      mode: "ready" | "empty" | "safe";
      note: string;
    };
  };

  let response = await sendToTab<StatusResponse>(
    tab,
    { type: "chattidy:status" }
  );

  if (response?.ok && response.buildVersion !== BUILD_VERSION && tab?.id) {
    if (statusElement) {
      statusElement.textContent = `正在启用 ChatTidy v${BUILD_VERSION} 并刷新页面…`;
    }
    if (openButton) openButton.disabled = true;
    await chrome.tabs.reload(tab.id);
    window.setTimeout(() => window.close(), 350);
    return;
  }

  if (!response?.ok && tab && await injectIntoTab(tab)) {
    response = await sendToTab<StatusResponse>(
      tab,
      { type: "chattidy:status" }
    );
  }

  if (!statusElement || !openButton) return;
  if (!response?.ok || !response.report) {
    primaryAction = "open";
    openButton.textContent = "选择聊天";
    openButton.disabled = true;
    statusElement.textContent = isSupportedUrl(tab?.url)
      ? "未能连接当前页面，请刷新后重试。"
      : "当前页面不是 ChatTidy 支持的 AI 网站。";
    return;
  }

  const report = response.report;
  statusElement.textContent = `${report.adapterLabel} · v${BUILD_VERSION}：${report.note}`;
  if (report.mode === "safe") {
    primaryAction = "reload";
    openButton.textContent = "刷新页面再试";
    openButton.disabled = false;
  } else {
    primaryAction = "open";
    openButton.textContent = "选择聊天";
    openButton.disabled = false;
  }
}

openButton?.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (primaryAction === "reload") {
    if (tab?.id) await chrome.tabs.reload(tab.id);
    window.close();
    return;
  }
  await sendToTab(tab, { type: "chattidy:open" });
  window.close();
});

void initialize();
