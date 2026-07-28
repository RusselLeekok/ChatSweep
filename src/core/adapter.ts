import {
  delay,
  dispatchRevealEvents,
  findSemanticAction,
  getElementHref,
  getElementTitle,
  isElementUsable,
  queryAllUnique,
  queryFirst,
  waitFor
} from "./dom";
import type {
  CompatibilityReport,
  ConversationTarget,
  DeleteResult,
  SelectorProfile
} from "./types";

const UI_ATTRIBUTE = "data-chattidy-ui";

export class SiteAdapter {
  constructor(readonly profile: SelectorProfile) {}

  listConversations(): ConversationTarget[] {
    const rows = queryAllUnique(document, this.profile.itemSelectors);
    const byKey = new Map<string, ConversationTarget>();

    for (const element of rows) {
      if (element.closest(`[${UI_ATTRIBUTE}]`)) continue;
      const href = getElementHref(element);
      const key = this.profile.extractKey(href);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, {
        key,
        title: getElementTitle(element, this.profile.titleSelectors),
        href,
        element
      });
    }

    return Array.from(byKey.values());
  }

  resolveConversation(key: string): ConversationTarget | null {
    return this.listConversations().find((conversation) => conversation.key === key) ?? null;
  }

  findMenuTrigger(element: HTMLElement): HTMLElement | null {
    const scopes: HTMLElement[] = [element];
    let parent = element.parentElement;
    for (let depth = 0; depth < 3 && parent && parent !== document.body; depth += 1) {
      scopes.push(parent);
      parent = parent.parentElement;
    }

    for (const scope of scopes) {
      const trigger = queryAllUnique(scope, this.profile.menuTriggerSelectors)
        .find((candidate) => !candidate.closest(`[${UI_ATTRIBUTE}]`));
      if (trigger) return trigger;
    }
    return null;
  }

  probe(): CompatibilityReport {
    const conversations = this.listConversations();
    const rowsWithMenuTrigger = conversations
      .filter((conversation) => this.findMenuTrigger(conversation.element))
      .length;

    if (conversations.length === 0) {
      return {
        adapterId: this.profile.id,
        adapterLabel: this.profile.label,
        supported: true,
        conversationCount: 0,
        rowsWithMenuTrigger: 0,
        mode: "empty",
        note: "当前侧栏没有检测到已渲染的聊天。请先展开侧栏。"
      };
    }

    if (rowsWithMenuTrigger === 0) {
      return {
        adapterId: this.profile.id,
        adapterLabel: this.profile.label,
        supported: true,
        conversationCount: conversations.length,
        rowsWithMenuTrigger,
        mode: "safe",
        note: "检测到聊天，但删除菜单结构不匹配。已进入安全模式。"
      };
    }

    return {
      adapterId: this.profile.id,
      adapterLabel: this.profile.label,
      supported: true,
      conversationCount: conversations.length,
      rowsWithMenuTrigger,
      mode: "ready",
      note: this.profile.id === "chatgpt"
        ? `已检测到 ${conversations.length} 条当前可见聊天，可使用前台快速队列。`
        : `已检测到 ${conversations.length} 条当前可见聊天。`
    };
  }

  async deleteConversation(
    key: string,
    options: { waitForRemoval?: boolean } = {}
  ): Promise<DeleteResult> {
    const target = this.resolveConversation(key);
    if (!target) {
      return this.failure(key, "未命名聊天", "resolve-row", "目标聊天已离开当前侧栏。");
    }

    target.element.scrollIntoView({ block: "center", behavior: "auto" });
    dispatchRevealEvents(target.element);
    await delay(120);

    const menuTrigger = this.findMenuTrigger(target.element);
    if (!menuTrigger) {
      return this.failure(key, target.title, "open-menu", "找不到该聊天的操作菜单。");
    }

    const surfacesBefore = new Set(
      queryAllUnique(document, this.profile.menuSurfaceSelectors)
    );
    const findMenuSurface = () => {
      const surfaces = queryAllUnique(document, this.profile.menuSurfaceSelectors);
      return surfaces.find((surface) => !surfacesBefore.has(surface) && isElementUsable(surface))
        ?? surfaces.find(isElementUsable)
        ?? null;
    };

    let menuSurface: HTMLElement | null;
    if (this.profile.menuActivation === "pointerdown") {
      const PointerEventConstructor = window.PointerEvent ?? window.MouseEvent;
      menuTrigger.dispatchEvent(new PointerEventConstructor("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0
      }));
      menuSurface = await waitFor(findMenuSurface, 160, 20);
    } else {
      menuTrigger.click();
      menuSurface = await waitFor(findMenuSurface);
    }

    if (!menuSurface && this.profile.menuActivation === "pointerdown") {
      menuTrigger.click();
      menuSurface = await waitFor(findMenuSurface);
    }

    if (!menuSurface) {
      return this.failure(key, target.title, "open-menu", "操作菜单没有出现。");
    }

    const deleteAction = await waitFor(() => {
      const surfaces = queryAllUnique(document, this.profile.menuSurfaceSelectors);
      const prioritizedSurfaces = [
        ...surfaces.filter(
          (surface) => !surfacesBefore.has(surface) && isElementUsable(surface)
        ),
        ...surfaces.filter(isElementUsable)
      ];
      for (const surface of prioritizedSurfaces) {
        const action = findSemanticAction(
          surface,
          this.profile.deleteActionSelectors,
          this.profile.deleteKeywords
        );
        if (action) return action;
      }
      return null;
    }, 1800, 40);

    if (!deleteAction) {
      this.dismissTransientUi();
      return this.failure(key, target.title, "find-delete", "菜单中没有可靠识别到删除操作。");
    }

    const dialogsBefore = new Set(queryAllUnique(document, this.profile.dialogSelectors));
    deleteAction.click();

    const nextStep = await waitFor(() => {
      if (!this.resolveConversation(key)) return { removed: true as const };
      const dialogs = queryAllUnique(document, this.profile.dialogSelectors);
      const dialog = dialogs.find(
        (candidate) => !dialogsBefore.has(candidate) && isElementUsable(candidate)
      ) ?? dialogs.find(isElementUsable);
      return dialog ? { removed: false as const, dialog } : null;
    });

    if (nextStep?.removed) {
      return this.success(key, target.title);
    }

    const dialog = nextStep?.dialog ?? null;

    if (!dialog) {
      this.dismissTransientUi();
      return this.failure(key, target.title, "confirm", "没有检测到删除确认窗口。");
    }

    const confirmAction = await waitFor(() => {
      const dialogs = queryAllUnique(document, this.profile.dialogSelectors);
      const prioritizedDialogs = [
        ...dialogs.filter(
          (candidate) => !dialogsBefore.has(candidate) && isElementUsable(candidate)
        ),
        ...dialogs.filter(isElementUsable)
      ];
      for (const candidate of prioritizedDialogs) {
        const action = findSemanticAction(
          candidate,
          this.profile.confirmActionSelectors,
          this.profile.confirmKeywords
        );
        if (action) return action;
      }
      return null;
    }, 1800, 40);

    if (!confirmAction) {
      this.dismissTransientUi();
      return this.failure(key, target.title, "confirm", "确认窗口中没有可靠识别到删除按钮。");
    }

    const activeDialog = queryAllUnique(document, this.profile.dialogSelectors)
      .find((candidate) => candidate.contains(confirmAction)) ?? dialog;
    confirmAction.click();

    if (options.waitForRemoval === false) {
      const submissionState = await waitFor(() => {
        if (!confirmAction.isConnected || !isElementUsable(confirmAction)) {
          return "confirmation-closed" as const;
        }
        if (!activeDialog.isConnected || !isElementUsable(activeDialog)) {
          return "dialog-closed" as const;
        }
        if (!this.resolveConversation(key)) return "removed" as const;
        return null;
      }, 2500, 30);

      if (submissionState === "removed") {
        return this.success(key, target.title);
      }
      if (
        submissionState === "confirmation-closed"
        || submissionState === "dialog-closed"
      ) {
        return this.submitted(key, target.title);
      }
      return this.failure(
        key,
        target.title,
        "confirm",
        "删除请求已点击，但确认窗口没有及时关闭。"
      );
    }

    const removed = await waitFor(
      () => this.resolveConversation(key) ? null : true,
      5000,
      100
    );

    if (!removed) {
      return this.failure(key, target.title, "verify", "站点未在超时前移除该聊天。");
    }
    return this.success(key, target.title);
  }

  async verifyDeletedConversations(
    targets: Array<{ key: string; title: string }>,
    timeout = 8000
  ): Promise<DeleteResult[]> {
    if (targets.length === 0) return [];

    const pending = new Set(targets.map((target) => target.key));
    const startedAt = Date.now();

    while (pending.size > 0 && Date.now() - startedAt < timeout) {
      const visibleKeys = new Set(
        this.listConversations().map((conversation) => conversation.key)
      );
      for (const key of pending) {
        if (!visibleKeys.has(key)) pending.delete(key);
      }
      if (pending.size > 0) await delay(100);
    }

    return targets.map((target) => pending.has(target.key)
      ? this.failure(
        target.key,
        target.title,
        "verify",
        "删除请求已提交，但站点未在超时前移除该聊天。"
      )
      : this.success(target.key, target.title)
    );
  }

  dismissTransientUi(): void {
    const closeButton = queryFirst(document, [
      "[role='dialog'] button[aria-label='Close']",
      "[role='dialog'] button[aria-label='关闭']",
      "[aria-modal='true'] button[aria-label='Close']"
    ]);
    if (closeButton) {
      closeButton.click();
      return;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  private success(key: string, title: string): DeleteResult {
    return {
      key,
      title,
      success: true,
      stage: "verify",
      message: "已删除并验证。"
    };
  }

  private submitted(key: string, title: string): DeleteResult {
    return {
      key,
      title,
      success: true,
      stage: "submitted",
      message: "删除请求已提交。"
    };
  }

  private failure(
    key: string,
    title: string,
    stage: DeleteResult["stage"],
    message: string
  ): DeleteResult {
    return { key, title, success: false, stage, message };
  }
}
