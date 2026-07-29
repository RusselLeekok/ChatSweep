import { getProfile } from "../adapters/profiles";
import { SiteAdapter } from "../core/adapter";
import { delay } from "../core/dom";
import { BUILD_VERSION } from "../version";
import type {
  CompatibilityReport,
  ConversationTarget,
  DeleteProgress,
  DeleteResult
} from "../core/types";

const ROOT_ID = "chattidy-root";
const CHECK_CLASS = "chattidy-check";
const OWNER_ATTRIBUTE = "data-chattidy-owner";

class ChatTidyController {
  private readonly adapter: SiteAdapter | null;
  private readonly root: HTMLElement;
  private selected = new Set<string>();
  private selectionMode = false;
  private deleting = false;
  private cancelRequested = false;
  private refreshTimer: number | null = null;
  private observer: MutationObserver | null = null;
  private lastReport: CompatibilityReport | null = null;
  private lastResults: DeleteResult[] | null = null;

  constructor() {
    const profile = getProfile();
    this.adapter = profile ? new SiteAdapter(profile) : null;
    this.root = this.createRoot();
    this.bindEvents();
    this.render();
    this.observePage();
    this.bindRuntimeMessages();
  }

  private createRoot(): HTMLElement {
    document.getElementById(ROOT_ID)?.remove();
    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.dataset.chattidyUi = "true";
    root.dataset.chattidyVersion = BUILD_VERSION;
    root.setAttribute("aria-label", "ChatTidy 批量聊天管理");
    document.body.appendChild(root);
    return root;
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
      if (!action) return;

      if (action === "expand") this.startSelection();
      if (action === "collapse") this.collapse();
      if (action === "close") this.dismiss();
      if (action === "toggle-all") this.toggleAll();
      if (action === "open-delete") this.openDeleteDialog();
      if (action === "cancel-delete") this.closeDeleteDialog();
      if (action === "confirm-delete") void this.runDelete();
      if (action === "stop-delete") this.cancelRequested = true;
      if (action === "refresh") this.refresh();
      if (action === "reload-page") location.reload();
    });

    this.root.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.matches("[data-role='acknowledge']")) {
        const confirmButton = this.root.querySelector<HTMLButtonElement>(
          "[data-action='confirm-delete']"
        );
        if (confirmButton) confirmButton.disabled = !target.checked;
      }
    });

    document.addEventListener(
      "click",
      (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
          `.${CHECK_CLASS}`
        );
        if (!button) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const key = button.dataset.key;
        if (!key) return;
        this.lastResults = null;
        if (this.selected.has(key)) this.selected.delete(key);
        else this.selected.add(key);
        this.syncCheckboxes();
        this.render();
      },
      true
    );
  }

  private observePage(): void {
    this.observer = new MutationObserver((mutations) => {
      if (!this.selectionMode) return;
      const onlyChatTidy = mutations.every((mutation) =>
        Array.from(mutation.addedNodes).every((node) =>
          node instanceof Element
            ? Boolean(node.closest(`#${ROOT_ID}, .${CHECK_CLASS}`))
            : true
        )
      );
      if (onlyChatTidy) return;
      if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.refresh(), 120);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private bindRuntimeMessages(): void {
    if (!chrome?.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "chattidy:open") {
        this.startSelection();
        sendResponse({ ok: true, report: this.lastReport, buildVersion: BUILD_VERSION });
      }
      if (message?.type === "chattidy:status") {
        const report = this.adapter?.probe() ?? null;
        sendResponse({ ok: Boolean(report), report, buildVersion: BUILD_VERSION });
      }
      return false;
    });
  }

  private startSelection(): void {
    if (!this.adapter) return;
    this.root.hidden = false;
    this.selectionMode = true;
    this.lastResults = null;
    this.root.dataset.expanded = "true";
    this.refresh();
  }

  private dismiss(): void {
    if (this.deleting) return;
    this.selectionMode = false;
    this.selected.clear();
    this.lastResults = null;
    this.root.dataset.dialog = "false";
    this.root.dataset.expanded = "false";
    this.removeCheckboxes();
    this.root.replaceChildren();
    this.root.hidden = true;
  }

  private collapse(): void {
    if (this.deleting) return;
    this.selectionMode = false;
    this.selected.clear();
    this.lastResults = null;
    this.root.dataset.dialog = "false";
    this.root.dataset.expanded = "false";
    this.removeCheckboxes();
    this.render();
  }

  private refresh(): void {
    if (!this.adapter) {
      this.render();
      return;
    }
    this.lastReport = this.adapter.probe();
    if (this.selectionMode) {
      const targets = this.adapter.listConversations();
      const currentKeys = new Set(targets.map((target) => target.key));
      this.selected.forEach((key) => {
        if (!currentKeys.has(key)) this.selected.delete(key);
      });
      this.injectCheckboxes(targets);
    }
    this.render();
  }

  private injectCheckboxes(targets: ConversationTarget[]): void {
    for (const target of targets) {
      const existing = target.element.querySelector<HTMLButtonElement>(
        `:scope > .${CHECK_CLASS}`
      );
      if (existing) {
        existing.dataset.key = target.key;
        continue;
      }

      target.element.setAttribute(OWNER_ATTRIBUTE, "true");
      const button = document.createElement("button");
      button.type = "button";
      button.className = CHECK_CLASS;
      button.dataset.key = target.key;
      button.dataset.chattidyUi = "true";
      button.setAttribute("role", "checkbox");
      button.setAttribute("aria-label", `选择聊天：${target.title}`);
      target.element.appendChild(button);
    }
    this.syncCheckboxes();
  }

  private removeCheckboxes(): void {
    document.querySelectorAll(`.${CHECK_CLASS}`).forEach((element) => element.remove());
    document.querySelectorAll(`[${OWNER_ATTRIBUTE}]`).forEach((element) => {
      element.removeAttribute(OWNER_ATTRIBUTE);
    });
  }

  private syncCheckboxes(): void {
    document.querySelectorAll<HTMLButtonElement>(`.${CHECK_CLASS}`).forEach((button) => {
      const checked = Boolean(button.dataset.key && this.selected.has(button.dataset.key));
      button.dataset.checked = String(checked);
      button.setAttribute("aria-checked", String(checked));
    });
  }

  private toggleAll(): void {
    if (!this.adapter || this.deleting) return;
    this.lastResults = null;
    const targets = this.adapter.listConversations();
    const everySelected = targets.length > 0 && targets.every((target) => this.selected.has(target.key));
    if (everySelected) this.selected.clear();
    else targets.forEach((target) => this.selected.add(target.key));
    this.syncCheckboxes();
    this.render();
  }

  private openDeleteDialog(): void {
    if (!this.adapter || this.selected.size === 0 || this.deleting) return;
    this.lastResults = null;
    this.root.dataset.dialog = "true";
    this.render();
    this.root.querySelector<HTMLInputElement>("[data-role='acknowledge']")?.focus();
  }

  private closeDeleteDialog(): void {
    if (this.deleting) return;
    this.root.dataset.dialog = "false";
    this.render();
  }

  private async runDelete(): Promise<void> {
    if (!this.adapter || this.deleting || this.selected.size === 0) return;

    const acknowledge = this.root.querySelector<HTMLInputElement>(
      "[data-role='acknowledge']"
    );
    if (!acknowledge?.checked) return;

    const queue = Array.from(this.selected);
    const interimResults: DeleteResult[] = [];
    const submittedTargets: Array<{ key: string; title: string }> = [];
    this.deleting = true;
    this.cancelRequested = false;
    this.root.dataset.dialog = "false";

    for (let index = 0; index < queue.length; index += 1) {
      if (this.cancelRequested) break;
      const key = queue[index];
      if (!key) continue;
      const current = this.adapter.resolveConversation(key);
      const progress: DeleteProgress = {
        current: index + 1,
        total: queue.length,
        title: current?.title ?? "聊天"
      };
      this.render(progress);

      const result = await this.adapter.deleteConversation(key, {
        waitForRemoval: false
      });
      interimResults.push(result);
      if (result.success) {
        this.selected.delete(key);
        if (result.stage === "submitted") {
          submittedTargets.push({ key: result.key, title: result.title });
        }
      }
      this.refresh();
      if (index < queue.length - 1 && !this.cancelRequested) {
        await delay(this.adapter.profile.interDeleteDelayMs ?? 220);
      }
    }

    let results = interimResults;
    if (submittedTargets.length > 0) {
      this.render({
        current: interimResults.length,
        total: queue.length,
        title: "正在统一确认删除结果"
      });
      const verifiedResults = await this.adapter.verifyDeletedConversations(
        submittedTargets
      );
      const verifiedByKey = new Map(
        verifiedResults.map((result) => [result.key, result])
      );
      results = interimResults.map((result) =>
        result.stage === "submitted"
          ? verifiedByKey.get(result.key) ?? result
          : result
      );
      for (const result of results) {
        if (!result.success && this.adapter.resolveConversation(result.key)) {
          this.selected.add(result.key);
        }
      }
    }

    this.deleting = false;
    this.lastResults = results;
    this.render();
  }

  private render(progress?: DeleteProgress, results?: DeleteResult[]): void {
    const report = this.adapter?.probe() ?? null;
    this.lastReport = report;
    const targets = this.adapter?.listConversations() ?? [];
    const selectedTargets = targets.filter((target) => this.selected.has(target.key));
    const allSelected = targets.length > 0 && selectedTargets.length === targets.length;
    const modeClass = report?.mode === "ready" ? "ready" : report?.mode === "safe" ? "safe" : "empty";

    if (!this.selectionMode) {
      this.root.innerHTML = `
        <button class="chattidy-chip" type="button" data-action="expand">
          <span class="chattidy-mark" aria-hidden="true"></span>
          <span>ChatTidy</span>
          <small>v${BUILD_VERSION}</small>
        </button>
      `;
      return;
    }

    const resultSource = progress ? null : results ?? this.lastResults;
    const resultSummary = resultSource ? this.resultSummary(resultSource) : "";
    const progressMarkup = progress ? `
      <div class="chattidy-progress" role="status">
        <div class="chattidy-progress-copy">
          <strong>正在删除 ${progress.current}/${progress.total}</strong>
          <span>${escapeHtml(progress.title)}</span>
        </div>
        <button class="chattidy-button chattidy-button-quiet" type="button" data-action="stop-delete">停止</button>
      </div>
    ` : "";

    this.root.innerHTML = `
      <div class="chattidy-panel">
        <header class="chattidy-header">
          <div>
            <div class="chattidy-brand">
              <span class="chattidy-mark" aria-hidden="true"></span>
              <strong>ChatTidy</strong>
              <small>v${BUILD_VERSION}</small>
            </div>
            <span class="chattidy-site">${escapeHtml(report?.adapterLabel ?? "不支持的网站")}</span>
          </div>
          <div class="chattidy-window-actions" role="group" aria-label="面板控制">
            <button class="chattidy-icon-button" type="button" data-action="collapse" aria-label="收起 ChatTidy" title="收起 ChatTidy" ${this.deleting ? "disabled" : ""}>−</button>
            <button class="chattidy-icon-button chattidy-icon-button-close" type="button" data-action="close" aria-label="关闭 ChatTidy" title="关闭 ChatTidy" ${this.deleting ? "disabled" : ""}>×</button>
          </div>
        </header>

        <div class="chattidy-health chattidy-health-${modeClass}">
          <span>${escapeHtml(report?.note ?? "当前网站暂不支持。")}</span>
          <button type="button" data-action="${report?.mode === "safe" ? "reload-page" : "refresh"}">
            ${report?.mode === "safe" ? "刷新页面" : "重新检测"}
          </button>
        </div>

        <div class="chattidy-count">
          <strong>${this.selected.size}</strong>
          <span>条已选择</span>
          <span class="chattidy-count-total">当前可见 ${targets.length} 条</span>
        </div>

        ${resultSummary}
        ${progressMarkup}

        <div class="chattidy-actions">
          <button class="chattidy-button chattidy-button-quiet" type="button" data-action="toggle-all" ${targets.length === 0 || this.deleting ? "disabled" : ""}>
            ${allSelected ? "取消全选" : "全选当前"}
          </button>
          <button class="chattidy-button chattidy-button-danger" type="button" data-action="open-delete" ${this.selected.size === 0 || report?.mode === "safe" || this.deleting ? "disabled" : ""}>
            删除 ${this.selected.size || ""}
          </button>
        </div>
        <p class="chattidy-footnote">只处理侧栏中当前已加载的聊天</p>
      </div>
      ${this.renderDeleteDialog(selectedTargets)}
    `;
  }

  private renderDeleteDialog(selectedTargets: ConversationTarget[]): string {
    if (this.root.dataset.dialog !== "true") return "";
    const preview = selectedTargets.slice(0, 6);
    const remaining = selectedTargets.length - preview.length;
    const deleteExplanation = this.adapter?.profile.id === "chatgpt"
      ? "ChatTidy 会在前台逐条打开 ChatGPT 原生菜单和确认框；确认按钮关闭后立即处理下一条，不等待侧栏记录消失。"
      : "此操作不可撤销。ChatTidy 会逐条调用当前网站的原生删除流程。";
    return `
      <div class="chattidy-backdrop" data-role="delete-dialog">
        <div class="chattidy-dialog" role="dialog" aria-modal="true" aria-labelledby="chattidy-dialog-title">
          <h2 id="chattidy-dialog-title">删除 ${selectedTargets.length} 条聊天？</h2>
          <p>此操作不可撤销。${deleteExplanation}</p>
          <div class="chattidy-preview">
            ${preview.map((target) => `<div>${escapeHtml(target.title)}</div>`).join("")}
            ${remaining > 0 ? `<div class="chattidy-preview-more">以及另外 ${remaining} 条</div>` : ""}
          </div>
          <label class="chattidy-ack">
            <input type="checkbox" data-role="acknowledge">
            <span>我确认这些聊天可以永久删除</span>
          </label>
          <div class="chattidy-dialog-actions">
            <button class="chattidy-button chattidy-button-quiet" type="button" data-action="cancel-delete">返回</button>
            <button class="chattidy-button chattidy-button-danger" type="button" data-action="confirm-delete" disabled>确认删除</button>
          </div>
        </div>
      </div>
    `;
  }

  private resultSummary(results: DeleteResult[]): string {
    const successCount = results.filter((result) => result.success).length;
    const failures = results.filter((result) => !result.success);
    if (failures.length === 0) {
      return `<div class="chattidy-result chattidy-result-success">已删除 ${successCount} 条聊天。</div>`;
    }
    const firstFailure = failures[0];
    return `
      <div class="chattidy-result chattidy-result-warning">
        已删除 ${successCount} 条，${failures.length} 条未完成。
        <span>未完成：${escapeHtml(firstFailure?.title ?? "未命名聊天")}。${escapeHtml(firstFailure?.message ?? "请重新检测页面结构。")}</span>
      </div>
    `;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const existingRoot = document.getElementById(ROOT_ID);
if (existingRoot && existingRoot.dataset.chattidyVersion !== BUILD_VERSION) {
  location.reload();
} else if (!existingRoot) {
  new ChatTidyController();
}
