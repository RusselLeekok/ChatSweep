import { beforeEach, describe, expect, it, vi } from "vitest";

const activeTab = {
  id: 7,
  url: "https://chat.deepseek.com/"
};

function renderPopup(): void {
  document.body.innerHTML = `
    <div id="status" role="status">正在检查当前页面...</div>
    <button id="open" type="button" disabled>选择聊天</button>
  `;
}

describe("ChatTidy popup actions", () => {
  beforeEach(() => {
    renderPopup();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.spyOn(window, "close").mockImplementation(() => undefined);
  });

  it("turns safe mode into a one-click page refresh", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([activeTab]),
        sendMessage: vi.fn().mockResolvedValue({
          ok: true,
          buildVersion: "0.4.3",
          report: {
            adapterLabel: "DeepSeek",
            conversationCount: 3,
            mode: "safe",
            note: "检测到聊天，但删除菜单结构不匹配。页面可能未加载完整，请刷新页面后再试。"
          }
        }),
        reload
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([
          { result: { present: true, version: "0.4.3" } }
        ]),
        insertCSS: vi.fn()
      }
    });

    await import("../src/popup/popup");

    const button = document.querySelector<HTMLButtonElement>("#open")!;
    await vi.waitFor(() => {
      expect(button.textContent).toBe("刷新页面再试");
      expect(button.disabled).toBe(false);
    });

    button.click();
    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledWith(7);
    });
  });

  it("keeps the primary action disabled on unsupported pages", async () => {
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([
          { id: 9, url: "chrome://extensions/" }
        ]),
        sendMessage: vi.fn().mockRejectedValue(new Error("No receiver")),
        reload: vi.fn()
      },
      scripting: {
        executeScript: vi.fn(),
        insertCSS: vi.fn()
      }
    });

    await import("../src/popup/popup");

    const button = document.querySelector<HTMLButtonElement>("#open")!;
    const status = document.querySelector<HTMLElement>("#status")!;
    await vi.waitFor(() => {
      expect(status.textContent).toContain("不是 ChatTidy 支持的 AI 网站");
      expect(button.disabled).toBe(true);
      expect(button.textContent).toBe("选择聊天");
    });
  });
});
