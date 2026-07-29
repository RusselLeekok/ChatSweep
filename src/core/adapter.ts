import {
  delay,
  dispatchRevealEvents,
  findSemanticAction,
  getElementHref,
  getElementTitle,
  isElementUsable,
  matchesKeyword,
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
      if (
        this.profile.denseSidebarOnly
        && rows.length >= 3
        && !this.isInDenseSidebarRegion(element)
      ) {
        continue;
      }
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
    const scopes = this.getConversationScopes(element);

    for (const scope of scopes) {
      const trigger = queryAllUnique(scope, this.profile.menuTriggerSelectors)
        .find((candidate) => this.isSafeMenuTrigger(candidate, element));
      if (trigger) return trigger;
    }

    if (this.profile.allowHeuristicMenuTrigger) {
      return this.findHeuristicMenuTrigger(element, scopes);
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

    if (rowsWithMenuTrigger === 0 && !this.profile.menuTriggerAppearsOnHover) {
      return {
        adapterId: this.profile.id,
        adapterLabel: this.profile.label,
        supported: true,
        conversationCount: conversations.length,
        rowsWithMenuTrigger,
        mode: "safe",
        note: "检测到聊天，但删除菜单结构不匹配。页面可能未加载完整，请刷新页面后再试。"
      };
    }

    return {
      adapterId: this.profile.id,
      adapterLabel: this.profile.label,
      supported: true,
      conversationCount: conversations.length,
      rowsWithMenuTrigger,
      mode: "ready",
      note: `已检测到 ${conversations.length} 条当前可见聊天。`
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
    this.revealConversationActions(target.element);
    const menuTrigger = await waitFor(() => {
      this.revealConversationActions(target.element);
      return this.findMenuTrigger(target.element);
    }, 1200, 60);
    if (!menuTrigger) {
      return this.failure(key, target.title, "open-menu", "找不到该聊天的操作菜单。");
    }

    const surfacesBefore = new Set(
      queryAllUnique(document, this.profile.menuSurfaceSelectors)
    );
    const globalDeleteActionsBefore = new Set(this.findGlobalDeleteActions());
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
        button: 0,
        pointerType: "mouse",
        isPrimary: true
      }));
      menuSurface = await waitFor(findMenuSurface, 160, 20);
    } else {
      menuTrigger.click();
      menuSurface = await waitFor(findMenuSurface, 500, 25);
    }

    if (
      !menuSurface
      && this.profile.menuActivation === "pointerdown"
      && this.profile.menuClickFallback !== false
    ) {
      menuTrigger.click();
      menuSurface = await waitFor(findMenuSurface, 500, 25);
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
          this.profile.deleteKeywords,
          this.profile.deleteSelectorRequiresKeyword
        );
        if (action) return action;
      }

      return this.findGlobalDeleteActions()
        .find((candidate) => !globalDeleteActionsBefore.has(candidate)) ?? null;
    }, 1800, 40);

    if (!deleteAction) {
      this.dismissTransientUi();
      return this.failure(key, target.title, "find-delete", "菜单中没有可靠识别到删除操作。");
    }

    const dialogsBefore = new Set(queryAllUnique(document, this.profile.dialogSelectors));
    deleteAction.click();

    if (this.profile.deleteWithoutConfirmation) {
      if (options.waitForRemoval === false) {
        const submitted = await waitFor(() => {
          if (!this.resolveConversation(key)) return "removed" as const;
          if (
            !deleteAction.isConnected
            || !isElementUsable(deleteAction)
            || (
              menuSurface
              && (!menuSurface.isConnected || !isElementUsable(menuSurface))
            )
          ) {
            return "submitted" as const;
          }
          return null;
        }, 2500, 30);

        if (submitted === "removed") return this.success(key, target.title);
        if (submitted === "submitted") return this.submitted(key, target.title);
        return this.failure(
          key,
          target.title,
          "find-delete",
          "已点击删除，但操作菜单没有及时关闭。"
        );
      }

      const removed = await waitFor(
        () => this.resolveConversation(key) ? null : true,
        8000,
        100
      );
      return removed
        ? this.success(key, target.title)
        : this.failure(key, target.title, "verify", "站点未在超时前移除该聊天。");
    }

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
          this.profile.confirmKeywords,
          this.profile.confirmSelectorRequiresKeyword
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

  private getConversationScopes(element: HTMLElement): HTMLElement[] {
    const scopes: HTMLElement[] = [element];
    let parent = element.parentElement;
    for (let depth = 0; depth < 4 && parent && parent !== document.body; depth += 1) {
      const nestedConversations = queryAllUnique(parent, this.profile.itemSelectors)
        .filter((candidate) => !candidate.closest(`[${UI_ATTRIBUTE}]`));
      if (nestedConversations.length > 1) break;
      scopes.push(parent);
      parent = parent.parentElement;
    }
    return scopes;
  }

  private revealConversationActions(element: HTMLElement): void {
    for (const scope of this.getConversationScopes(element)) {
      dispatchRevealEvents(scope);
    }
  }

  private findHeuristicMenuTrigger(
    element: HTMLElement,
    scopes: HTMLElement[]
  ): HTMLElement | null {
    const candidates = new Set<HTMLElement>();
    for (const scope of scopes) {
      queryAllUnique(scope, ["button", "[role='button']"])
        .forEach((candidate) => candidates.add(candidate));
    }

    let best: { element: HTMLElement; score: number } | null = null;
    const targetRect = element.getBoundingClientRect();
    for (const candidate of candidates) {
      if (!candidate.isConnected || candidate.closest(`[${UI_ATTRIBUTE}]`)) continue;
      if (candidate === element || candidate.contains(element)) continue;
      if (candidate.hidden || candidate.getAttribute("aria-hidden") === "true") continue;

      const text = (candidate.textContent ?? "").replace(/\s+/g, " ").trim();
      const attributes = [
        candidate.id,
        candidate.className,
        candidate.getAttribute("aria-label"),
        candidate.getAttribute("data-testid"),
        candidate.getAttribute("data-test-id"),
        candidate.getAttribute("data-slot")
      ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();

      let score = 0;
      const popup = candidate.getAttribute("aria-haspopup");
      if (popup === "menu" || popup === "true") score += 100;
      if (candidate.hasAttribute("aria-expanded")) score += 45;
      if (candidate.hasAttribute("data-state")) score += 35;
      if (/(menu|more|option|action|overflow|ellipsis|dropdown)/i.test(attributes)) {
        score += 65;
      }
      if (candidate.querySelector("svg") && text.length <= 2) score += 20;
      if (text.length === 0) score += 10;
      if (text.length > 24 || text.includes(element.textContent?.trim() ?? "\u0000")) {
        score -= 80;
      }

      const rect = candidate.getBoundingClientRect();
      if (rect.width > 0 && rect.width <= 64 && rect.height <= 64) score += 20;
      if (
        targetRect.width > 0
        && rect.left >= targetRect.left + targetRect.width * 0.55
      ) {
        score += 15;
      }

      if (score >= 20 && (!best || score > best.score)) {
        best = { element: candidate, score };
      }
    }
    return best?.element ?? null;
  }

  private findGlobalDeleteActions(): HTMLElement[] {
    return queryAllUnique(document, [
      ...this.profile.deleteActionSelectors,
      "[role='menuitem']",
      "[data-radix-collection-item]",
      "[data-slot*='menu-item']",
      "button",
      "[role='button']"
    ]).filter((candidate) =>
      !candidate.closest(`[${UI_ATTRIBUTE}]`)
      && isElementUsable(candidate)
      && matchesKeyword(candidate, this.profile.deleteKeywords)
    );
  }

  private isInDenseSidebarRegion(element: HTMLElement): boolean {
    const elementRect = element.getBoundingClientRect();
    const maximumSidebarLeft = Math.min(600, window.innerWidth * 0.4);
    if (elementRect.width > 0 && elementRect.left > maximumSidebarLeft) return false;

    let current = element.parentElement;
    for (let depth = 0; depth < 7 && current && current !== document.body; depth += 1) {
      const conversationLinks = current.querySelectorAll(
        "a[href^='/c/'], a[href^='/chat/']"
      ).length;
      if (conversationLinks >= 2) {
        const rect = current.getBoundingClientRect();
        if (rect.width === 0 || rect.width <= 600) return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  private isSafeMenuTrigger(
    candidate: HTMLElement,
    conversationElement: HTMLElement
  ): boolean {
    if (!candidate.isConnected || candidate.closest(`[${UI_ATTRIBUTE}]`)) return false;
    if (candidate === conversationElement || candidate.contains(conversationElement)) {
      return false;
    }
    if (candidate.hidden || candidate.getAttribute("aria-hidden") === "true") return false;
    return true;
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
