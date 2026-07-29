export const DELETE_WORDS = [
  "delete",
  "remove",
  "删除",
  "刪除",
  "移除",
  "削除",
  "삭제",
  "löschen",
  "supprimer",
  "eliminar",
  "excluir",
  "удалить"
];

export const CONFIRM_WORDS = [
  ...DELETE_WORDS,
  "删除该对话",
  "删除对话",
  "确认删除",
  "永久删除",
  "confirm",
  "确认",
  "確定",
  "确定",
  "继续",
  "continue"
];

export function queryAllUnique(
  root: ParentNode,
  selectors: readonly string[]
): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const selector of selectors) {
    try {
      root.querySelectorAll<HTMLElement>(selector).forEach((element) => found.add(element));
    } catch {
      // A stale selector should not disable the remaining strategies.
    }
  }
  return Array.from(found);
}

export function queryFirst(
  root: ParentNode,
  selectors: readonly string[]
): HTMLElement | null {
  for (const selector of selectors) {
    try {
      const element = root.querySelector<HTMLElement>(selector);
      if (element) return element;
    } catch {
      // Continue to the next selector.
    }
  }
  return null;
}

export function isElementUsable(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") {
    return false;
  }

  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
    if (current.getAttribute("data-state") === "closed") return false;
    if (current.hasAttribute("inert")) return false;
    const style = window.getComputedStyle(current);
    if (
      style.display === "none"
      || style.visibility === "hidden"
      || style.opacity === "0"
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

export function normalizedText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function matchesKeyword(element: Element, keywords: readonly string[]): boolean {
  const text = normalizedText(element);
  if (!text || text.length > 32) return false;
  return keywords.some((keyword) => {
    const normalizedKeyword = keyword.toLocaleLowerCase();
    return text === normalizedKeyword || text.startsWith(`${normalizedKeyword} `);
  });
}

export function findSemanticAction(
  root: ParentNode,
  selectors: readonly string[],
  keywords: readonly string[],
  requireKeywordForSelectors = false
): HTMLElement | null {
  const byAttribute = queryAllUnique(root, selectors).find((candidate) =>
    isElementUsable(candidate)
    && (!requireKeywordForSelectors || matchesKeyword(candidate, keywords))
  );
  if (byAttribute) return byAttribute;

  const candidates = queryAllUnique(root, [
    "[role='menuitem']",
    "button",
    "[role='button']",
    "gem-menu-item"
  ]);
  return candidates.find((candidate) => isElementUsable(candidate) && matchesKeyword(candidate, keywords)) ?? null;
}

export function getElementHref(element: HTMLElement): string {
  if (element instanceof HTMLAnchorElement) return element.href;
  const anchor = element.querySelector<HTMLAnchorElement>("a[href]");
  return anchor?.href ?? "";
}

export function getElementTitle(
  element: HTMLElement,
  selectors: readonly string[]
): string {
  for (const selector of selectors) {
    const titleElement = element.querySelector<HTMLElement>(selector);
    const text = titleElement?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const text = element.textContent?.replace(/\s+/g, " ").trim();
  return text?.slice(0, 120) || "未命名聊天";
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function waitFor<T>(
  resolveValue: () => T | null,
  timeout = 2500,
  interval = 80
): Promise<T | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const value = resolveValue();
    if (value) return value;
    await delay(interval);
  }
  return null;
}

export function dispatchRevealEvents(element: HTMLElement): void {
  for (const type of ["pointerenter", "mouseenter", "mouseover", "focusin"]) {
    element.dispatchEvent(new Event(type, { bubbles: true }));
  }
}
