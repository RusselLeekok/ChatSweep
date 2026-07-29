import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILES } from "../src/adapters/profiles";
import { SiteAdapter } from "../src/core/adapter";
import { findSemanticAction } from "../src/core/dom";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
});

describe("DeepSeek adapter compatibility", () => {
  const profile = PROFILES.find((candidate) => candidate.id === "deepseek");

  it("recognizes the current unlabeled action button", () => {
    document.body.innerHTML = `
      <aside>
        <a href="/a/chat/s/deepseek-one">
          <div>DeepSeek chat</div>
          <button><svg aria-hidden="true"></svg></button>
        </a>
      </aside>
    `;

    const adapter = new SiteAdapter(profile!);
    expect(adapter.probe()).toMatchObject({
      conversationCount: 1,
      rowsWithMenuTrigger: 1,
      mode: "ready"
    });
  });

  it("uses the current error menu option and native confirmation dialog", async () => {
    document.body.innerHTML = `
      <aside>
        <div id="deepseek-row">
          <a href="/a/chat/s/deepseek-two">
            <div>DeepSeek chat</div>
            <button id="deepseek-more"><svg aria-hidden="true"></svg></button>
          </a>
        </div>
      </aside>
    `;

    document.querySelector("#deepseek-more")?.addEventListener("click", () => {
      const menu = document.createElement("div");
      menu.className = "ds-dropdown-menu";
      menu.setAttribute("role", "menu");
      menu.innerHTML = `
        <div class="ds-dropdown-menu-option">重命名</div>
        <div class="ds-dropdown-menu-option ds-dropdown-menu-option--error">删除</div>
      `;
      document.body.appendChild(menu);
      menu.querySelector(".ds-dropdown-menu-option--error")?.addEventListener("click", () => {
        const dialog = document.createElement("div");
        dialog.setAttribute("role", "dialog");
        dialog.innerHTML = `<button>删除该对话</button>`;
        document.body.appendChild(dialog);
        dialog.querySelector("button")?.addEventListener("click", () => {
          document.querySelector("#deepseek-row")?.remove();
        });
      });
    });

    const adapter = new SiteAdapter(profile!);
    const result = await adapter.deleteConversation("deepseek-two");
    expect(result).toMatchObject({ success: true, stage: "verify" });
  });
});

describe("Gemini adapter compatibility", () => {
  const profile = PROFILES.find((candidate) => candidate.id === "gemini");

  it("waits for the delayed Material confirmation action", async () => {
    document.body.innerHTML = `
      <div data-test-id="conversation" id="gemini-row">
        <a href="/app/gemini-one">
          <span data-test-id="conversation-title">Gemini chat</span>
        </a>
        <button data-test-id="conversation-actions-menu-icon-button"></button>
      </div>
    `;

    document
      .querySelector("[data-test-id='conversation-actions-menu-icon-button']")
      ?.addEventListener("click", () => {
        const menu = document.createElement("div");
        menu.className = "mat-mdc-menu-panel";
        menu.setAttribute("role", "menu");
        menu.innerHTML = `<button data-test-id="delete-button">删除</button>`;
        document.body.appendChild(menu);
        menu.querySelector("button")?.addEventListener("click", () => {
          menu.remove();
          const overlay = document.createElement("div");
          overlay.className = "cdk-overlay-container";
          overlay.innerHTML = `
            <div role="dialog" class="mat-mdc-dialog-container">
              <div class="mat-mdc-dialog-actions"></div>
            </div>
          `;
          document.body.appendChild(overlay);
          window.setTimeout(() => {
            const actions = overlay.querySelector(".mat-mdc-dialog-actions");
            if (!actions) return;
            actions.innerHTML = `
              <button data-test-id="confirm-dialog-cancel">取消</button>
              <button data-test-id="confirm-dialog-delete">删除</button>
            `;
            actions.firstElementChild?.addEventListener("click", () => {
              overlay.remove();
            });
            actions.lastElementChild?.addEventListener("click", () => {
              document.querySelector("#gemini-row")?.remove();
              overlay.remove();
            });
          }, 40);
        });
      });

    const adapter = new SiteAdapter(profile!);
    const result = await adapter.deleteConversation("gemini-one");
    expect(result).toMatchObject({ success: true, stage: "verify" });
    expect(document.querySelector("#gemini-row")).toBeNull();
  });
});

describe("Grok adapter compatibility", () => {
  const profile = PROFILES.find((candidate) => candidate.id === "grok");

  it("recognizes the current non-semantic sidebar and unlabeled row action button", async () => {
    document.body.innerHTML = `
      <div class="grok-sidebar-shell">
        <section>
          <div id="grok-row">
            <a id="grok-open-chat" href="/c/grok-current">
              <span>Modern Healthy Lifestyle</span>
              <button
                id="grok-more"
                aria-haspopup="menu"
                aria-label="备选方案"
                data-state="closed"
                style="display: none"
              ><svg aria-hidden="true"></svg></button>
            </a>
          </div>
          <div><a href="/c/grok-two">Second sidebar chat</a></div>
          <div><a href="/c/grok-three">Third sidebar chat</a></div>
        </section>
      </div>
      <main>
        <a href="/c/main-content-link">生成一张科比在中国高中教师门口被罚站的照片</a>
      </main>
    `;

    const openChat = vi.fn();
    document.querySelector("#grok-open-chat")?.addEventListener("click", openChat);
    document.querySelector("#grok-more")?.addEventListener("pointerdown", () => {
        const popup = document.createElement("div");
        popup.className = "grok-floating-popup";
        popup.innerHTML = `<div role="menuitem">Delete</div>`;
        document.body.appendChild(popup);
        popup.querySelector("[role='menuitem']")?.addEventListener("click", () => {
          popup.remove();
          window.setTimeout(() => {
            document.querySelector("#grok-row")?.remove();
          }, 80);
        });
    });

    const adapter = new SiteAdapter(profile!);
    expect(adapter.listConversations().map((item) => item.key)).toEqual([
      "grok-current",
      "grok-two",
      "grok-three"
    ]);
    expect(adapter.probe()).toMatchObject({
      conversationCount: 3,
      rowsWithMenuTrigger: 1,
      mode: "ready"
    });

    const result = await adapter.deleteConversation("grok-current", {
      waitForRemoval: false
    });
    expect(result).toMatchObject({ success: true, stage: "submitted" });
    expect(openChat).not.toHaveBeenCalled();

    const [verified] = await adapter.verifyDeletedConversations([
      { key: "grok-current", title: "Modern Healthy Lifestyle" }
    ], 500);
    expect(verified).toMatchObject({ success: true, stage: "verify" });
  });
});

describe("Doubao adapter compatibility", () => {
  const profile = PROFILES.find((candidate) => candidate.id === "doubao");

  it("opens the Radix menu with pointerdown and confirms an alert dialog", async () => {
    document.body.innerHTML = `
      <div id="flow_chat_sidebar">
        <div data-empty-conversation="false">
          <div id="row">
            <a id="conversation_123" href="/chat/123">
              <span class="content">Doubao chat</span>
            </a>
            <div data-testid="chat_list_item_setting_more_123">
              <button id="doubao-more" aria-haspopup="menu"></button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.querySelector("#doubao-more")?.addEventListener("pointerdown", () => {
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      menu.setAttribute("data-slot", "dropdown-menu-content");
      document.body.appendChild(menu);
      window.setTimeout(() => {
        menu.innerHTML = `<div role="menuitem" data-slot="dropdown-menu-item">删除</div>`;
        menu.querySelector("[role='menuitem']")?.addEventListener("click", () => {
          const dialog = document.createElement("div");
          dialog.setAttribute("role", "alertdialog");
          dialog.innerHTML = `<button>删除</button>`;
          document.body.appendChild(dialog);
          dialog.querySelector("button")?.addEventListener("click", () => {
            document.querySelector("#row")?.remove();
          });
        });
      }, 40);
    });

    const adapter = new SiteAdapter(profile!);
    const result = await adapter.deleteConversation("123");
    expect(result).toMatchObject({ success: true, stage: "verify" });
  });

  it("excludes the fixed Doubao main entry outside chat history", () => {
    document.body.innerHTML = `
      <div id="flow_chat_sidebar">
        <a id="conversation_main" href="/chat/main">
          <span class="content">豆包</span>
        </a>
        <div data-empty-conversation="false">
          <a id="conversation_456" href="/chat/456">
            <span class="content">History chat</span>
          </a>
        </div>
      </div>
    `;

    const adapter = new SiteAdapter(profile!);
    expect(adapter.listConversations().map((item) => item.key)).toEqual(["456"]);
  });
});

describe("站点配置", () => {
  it("覆盖五个目标平台", () => {
    expect(PROFILES.map((profile) => profile.id)).toEqual([
      "chatgpt",
      "grok",
      "gemini",
      "deepseek",
      "doubao"
    ]);
  });

  it.each([
    ["chatgpt", "https://chatgpt.com/c/chat-123", "chat-123"],
    ["grok", "https://grok.com/c/grok-123", "grok-123"],
    ["gemini", "https://gemini.google.com/app/gemini-123", "gemini-123"],
    ["deepseek", "https://chat.deepseek.com/a/chat/s/deepseek-123", "deepseek-123"],
    ["doubao", "https://www.doubao.com/chat/doubao-123", "doubao-123"]
  ])("从 %s 链接提取稳定键", (id, href, expected) => {
    const profile = PROFILES.find((candidate) => candidate.id === id);
    expect(profile?.extractKey(href)).toBe(expected);
  });
});

describe("语义动作检测", () => {
  it("优先使用稳定属性", () => {
    document.body.innerHTML = `
      <div role="menu">
        <button role="menuitem">重命名</button>
        <button role="menuitem" data-testid="delete-conversation">任意文案</button>
      </div>
    `;
    const menu = document.querySelector("[role='menu']");
    expect(menu).not.toBeNull();
    const action = findSemanticAction(
      menu as HTMLElement,
      ["[data-testid='delete-conversation']"],
      ["删除"]
    );
    expect(action?.getAttribute("data-testid")).toBe("delete-conversation");
  });

  it("稳定属性缺失时使用短语义文本", () => {
    document.body.innerHTML = `
      <div role="menu">
        <button role="menuitem">重命名</button>
        <button role="menuitem">删除</button>
      </div>
    `;
    const action = findSemanticAction(
      document.querySelector("[role='menu']") as HTMLElement,
      [],
      ["删除"]
    );
    expect(action?.textContent).toBe("删除");
  });

  it("不把包含删除词的长说明当成按钮", () => {
    document.body.innerHTML = `
      <div role="menu">
        <button role="menuitem">删除前请先阅读这段很长很长的不可恢复风险说明文字</button>
      </div>
    `;
    const action = findSemanticAction(
      document.querySelector("[role='menu']") as HTMLElement,
      [],
      ["删除"]
    );
    expect(action).toBeNull();
  });
});

describe("ChatGPT 适配器", () => {
  const profile = PROFILES.find((candidate) => candidate.id === "chatgpt");

  it("去重聊天并报告可用状态", () => {
    document.body.innerHTML = `
      <nav aria-label="Chat history">
        <div>
          <a href="/c/one"><span class="truncate">第一条</span></a>
          <button aria-haspopup="menu">More</button>
        </div>
        <div>
          <a href="/c/two"><span class="truncate">第二条</span></a>
          <button aria-haspopup="menu">More</button>
        </div>
        <a href="/c/one">重复节点</a>
      </nav>
    `;
    const adapter = new SiteAdapter(profile!);
    expect(adapter.listConversations()).toHaveLength(2);
    expect(adapter.probe()).toMatchObject({
      conversationCount: 2,
      rowsWithMenuTrigger: 2,
      mode: "ready"
    });
  });

  it("菜单结构不匹配时进入安全模式", () => {
    document.body.innerHTML = `
      <nav aria-label="Chat history">
        <a href="/c/one"><span class="truncate">第一条</span></a>
      </nav>
    `;
    const adapter = new SiteAdapter(profile!);
    expect(adapter.probe()).toMatchObject({
      mode: "safe",
      rowsWithMenuTrigger: 0
    });
    expect(adapter.probe().note).toContain("安全模式");
  });

  it("通过原生菜单和确认窗口删除并验证目标消失", async () => {
    document.body.innerHTML = `
      <nav aria-label="Chat history">
        <div id="row">
          <a href="/c/one"><span class="truncate">准备删除</span></a>
          <button id="more" aria-haspopup="menu">More</button>
        </div>
      </nav>
    `;

    document.querySelector("#more")?.addEventListener("click", () => {
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      menu.innerHTML = `<button role="menuitem" data-testid="delete-conversation">删除</button>`;
      document.body.appendChild(menu);
      menu.querySelector("button")?.addEventListener("click", () => {
        const dialog = document.createElement("div");
        dialog.setAttribute("role", "dialog");
        dialog.innerHTML = `<button data-testid="confirm-delete">确认删除</button>`;
        document.body.appendChild(dialog);
        dialog.querySelector("button")?.addEventListener("click", () => {
          document.querySelector("#row")?.remove();
        });
      });
    });

    const adapter = new SiteAdapter(profile!);
    const result = await adapter.deleteConversation("one");
    expect(result).toMatchObject({ success: true, stage: "verify" });
    expect(adapter.listConversations()).toHaveLength(0);
  });

  it("submits first and verifies removal later as a batch", async () => {
    document.body.innerHTML = `
      <nav aria-label="Chat history">
        <div id="queued-row">
          <a href="/c/queued"><span class="truncate">Queued chat</span></a>
          <button id="queued-more" aria-haspopup="menu">More</button>
        </div>
      </nav>
    `;

    document.querySelector("#queued-more")?.addEventListener("click", () => {
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      menu.innerHTML = `
        <button role="menuitem" data-testid="delete-conversation">Delete</button>
      `;
      document.body.appendChild(menu);
      menu.querySelector("button")?.addEventListener("click", () => {
        menu.remove();
        const dialog = document.createElement("div");
        dialog.setAttribute("role", "dialog");
        dialog.innerHTML = `
          <button data-testid="confirm-delete">Delete</button>
        `;
        document.body.appendChild(dialog);
        dialog.querySelector("button")?.addEventListener("click", () => {
          dialog.remove();
        });
      });
    });

    const adapter = new SiteAdapter(profile!);
    const submitted = await adapter.deleteConversation("queued", {
      waitForRemoval: false
    });
    expect(submitted).toMatchObject({ success: true, stage: "submitted" });
    expect(adapter.resolveConversation("queued")).not.toBeNull();

    window.setTimeout(() => {
      document.querySelector("#queued-row")?.remove();
    }, 40);
    const [verified] = await adapter.verifyDeletedConversations([
      { key: "queued", title: "Queued chat" }
    ], 500);
    expect(verified).toMatchObject({ success: true, stage: "verify" });
  });
});
