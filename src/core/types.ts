export type AdapterId = "chatgpt" | "grok" | "gemini" | "deepseek" | "doubao";

export interface ConversationTarget {
  key: string;
  title: string;
  href: string;
  element: HTMLElement;
}

export interface SelectorProfile {
  id: AdapterId;
  label: string;
  hostnames: string[];
  itemSelectors: string[];
  titleSelectors: string[];
  menuTriggerSelectors: string[];
  menuSurfaceSelectors: string[];
  deleteActionSelectors: string[];
  dialogSelectors: string[];
  confirmActionSelectors: string[];
  deleteKeywords: string[];
  confirmKeywords: string[];
  interDeleteDelayMs?: number;
  menuActivation?: "click" | "pointerdown";
  extractKey: (href: string) => string | null;
}

export interface CompatibilityReport {
  adapterId: AdapterId;
  adapterLabel: string;
  supported: boolean;
  conversationCount: number;
  rowsWithMenuTrigger: number;
  mode: "ready" | "empty" | "safe";
  note: string;
}

export type DeleteStage =
  | "resolve-row"
  | "open-menu"
  | "find-delete"
  | "confirm"
  | "submitted"
  | "verify";

export interface DeleteResult {
  key: string;
  title: string;
  success: boolean;
  stage: DeleteStage;
  message: string;
}

export interface DeleteProgress {
  current: number;
  total: number;
  title: string;
}
