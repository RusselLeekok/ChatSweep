import { CONFIRM_WORDS, DELETE_WORDS } from "../core/dom";
import type { SelectorProfile } from "../core/types";

function matchPath(href: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = href.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

const commonMenuTriggers = [
  "button[aria-haspopup='menu']",
  "button[aria-label*='more' i]",
  "button[aria-label*='options' i]",
  "button[aria-label*='更多']",
  "button[data-testid*='menu' i]"
];

const commonMenuSurfaces = [
  "[role='menu']",
  "[data-radix-menu-content]",
  ".cdk-overlay-pane",
  ".mat-mdc-menu-panel"
];

const commonDialogs = [
  "[role='dialog']",
  "[role='alertdialog']",
  "[aria-modal='true']",
  ".mat-mdc-dialog-container"
];

const commonDeleteActions = [
  "[role='menuitem'][data-testid*='delete' i]",
  "button[data-testid*='delete' i]",
  "[role='menuitem'][class*='danger' i]",
  "[role='menuitem'] [class*='danger' i]"
];

const commonConfirmActions = [
  "[role='dialog'] button[data-testid*='confirm' i]",
  "[role='dialog'] button[data-testid*='delete' i]",
  "[aria-modal='true'] button[class*='danger' i]",
  "[aria-modal='true'] button[class*='primary' i]"
];

export const PROFILES: SelectorProfile[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    hostnames: ["chatgpt.com", "chat.openai.com"],
    itemSelectors: [
      "nav[aria-label*='history' i] a[href*='/c/']",
      "nav[aria-label*='聊天'] a[href*='/c/']",
      "nav a[href^='/c/']",
      "aside a[href*='/c/']"
    ],
    titleSelectors: [
      "[data-testid*='conversation-title' i]",
      ".truncate",
      "[class*='whitespace-nowrap']"
    ],
    menuTriggerSelectors: [
      "button[data-conversation-options-trigger]",
      "button[data-trailing-button]",
      ...commonMenuTriggers,
      "button[id^='radix-']"
    ],
    menuSurfaceSelectors: commonMenuSurfaces,
    deleteActionSelectors: [
      "[role='menuitem'][data-testid*='delete' i]",
      "[role='menuitem'] .text-token-text-error",
      ...commonDeleteActions
    ],
    dialogSelectors: commonDialogs,
    confirmActionSelectors: [
      "[role='dialog'] button.btn-danger",
      "[role='dialog'] button[data-testid*='confirm' i]",
      ...commonConfirmActions
    ],
    deleteKeywords: DELETE_WORDS,
    confirmKeywords: CONFIRM_WORDS,
    interDeleteDelayMs: 40,
    extractKey: (href) => matchPath(href, [/\/c\/([^/?#]+)/i])
  },
  {
    id: "grok",
    label: "Grok",
    hostnames: ["grok.com"],
    itemSelectors: [
      "nav a[href^='/c/']",
      "aside a[href^='/c/']",
      "nav a[href*='/chat/']",
      "aside a[href*='/chat/']"
    ],
    titleSelectors: ["[data-testid*='title' i]", "[class*='truncate']", "[class*='title' i]"],
    menuTriggerSelectors: commonMenuTriggers,
    menuSurfaceSelectors: commonMenuSurfaces,
    deleteActionSelectors: [
      "button[aria-label='Delete']",
      "button.text-fg-danger",
      ...commonDeleteActions
    ],
    dialogSelectors: commonDialogs,
    confirmActionSelectors: [
      "[role='dialog'] button[aria-label='Delete']",
      "[role='dialog'] button.text-fg-danger",
      ...commonConfirmActions
    ],
    deleteKeywords: DELETE_WORDS,
    confirmKeywords: CONFIRM_WORDS,
    extractKey: (href) => matchPath(href, [/\/c\/([^/?#]+)/i, /\/chat\/([^/?#]+)/i])
  },
  {
    id: "gemini",
    label: "Gemini",
    hostnames: ["gemini.google.com"],
    itemSelectors: [
      "[data-test-id='conversation']",
      "[data-test-id^='history-item']",
      ".conversation-card"
    ],
    titleSelectors: [
      "[data-test-id='conversation-title']",
      ".conversation-title-text",
      ".gds-label-l",
      "h3"
    ],
    menuTriggerSelectors: [
      "[data-test-id='actions-menu-button']",
      "[data-test-id='conversation-actions-menu-icon-button']",
      ...commonMenuTriggers
    ],
    menuSurfaceSelectors: [
      "gem-menu[role='menu']",
      ".mat-mdc-menu-panel[role='menu']",
      ...commonMenuSurfaces
    ],
    deleteActionSelectors: [
      "[data-test-id='delete-button']",
      "gem-menu-item[data-test-id*='delete' i]",
      ...commonDeleteActions
    ],
    dialogSelectors: [
      "mat-dialog-container",
      ".mat-mdc-dialog-container",
      ...commonDialogs
    ],
    confirmActionSelectors: [
      "[data-test-id*='confirm' i]",
      "[data-test-id*='delete' i]:not([data-test-id='delete-button'])",
      ".mat-mdc-dialog-actions button:last-child",
      ".cdk-overlay-container .mat-mdc-dialog-actions button:last-child",
      ".cdk-overlay-container button[color='primary']",
      ".cdk-overlay-container button[color='warn']",
      ".mat-mdc-dialog-actions button[color='warn']",
      ...commonConfirmActions
    ],
    deleteKeywords: DELETE_WORDS,
    confirmKeywords: CONFIRM_WORDS,
    extractKey: (href) => matchPath(href, [/\/app\/([^/?#]+)/i])
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hostnames: ["chat.deepseek.com"],
    itemSelectors: [
      "a[href*='/a/chat/s/']",
      "nav a[href*='/chat/']",
      "aside a[href*='/chat/']"
    ],
    titleSelectors: ["[class*='title' i]", "[class*='name' i]", "span", "div"],
    menuTriggerSelectors: [
      "button",
      "[role='button']",
      ...commonMenuTriggers
    ],
    menuSurfaceSelectors: [
      ".ds-dropdown-menu[role='menu']",
      ...commonMenuSurfaces
    ],
    deleteActionSelectors: [
      ".ds-dropdown-menu-option--error",
      "[class*='dropdown-menu-option--error']",
      ...commonDeleteActions
    ],
    dialogSelectors: commonDialogs,
    confirmActionSelectors: commonConfirmActions,
    deleteKeywords: DELETE_WORDS,
    confirmKeywords: CONFIRM_WORDS,
    extractKey: (href) =>
      matchPath(href, [/\/a\/chat\/s\/([^/?#]+)/i, /\/chat\/([^/?#]+)/i])
  },
  {
    id: "doubao",
    label: "豆包",
    hostnames: ["www.doubao.com", "doubao.com"],
    itemSelectors: [
      "#flow_chat_sidebar [data-empty-conversation='false'] a[href^='/chat/']",
      "#flow_chat_sidebar [data-empty-conversation='false'] [id^='conversation_']",
      "[data-testid='chat_list_wrapper'] [data-empty-conversation='false'] a[href^='/chat/']"
    ],
    titleSelectors: ["[class*='content' i]", "[class*='title' i]", ".font-medium"],
    menuTriggerSelectors: [
      "[data-testid^='chat_list_item_setting_more_'] button",
      "[data-testid^='chat_list_item_setting_more_'] [data-slot='dropdown-menu-trigger']",
      ...commonMenuTriggers
    ],
    menuSurfaceSelectors: [
      "[data-slot='dropdown-menu-content']",
      ...commonMenuSurfaces
    ],
    deleteActionSelectors: [
      "[data-slot='dropdown-menu-item'][data-theme='danger']",
      "[data-slot='dropdown-menu-item'][class*='danger']",
      ...commonDeleteActions
    ],
    dialogSelectors: commonDialogs,
    confirmActionSelectors: commonConfirmActions,
    deleteKeywords: DELETE_WORDS,
    confirmKeywords: CONFIRM_WORDS,
    menuActivation: "pointerdown",
    extractKey: (href) => matchPath(href, [/\/chat\/([^/?#]+)/i])
  }
];

export function getProfile(hostname = location.hostname): SelectorProfile | null {
  if (hostname === "127.0.0.1" || hostname === "localhost") {
    const fixtureId = document.documentElement.dataset.chattidyFixture;
    const fixtureProfile = PROFILES.find((profile) => profile.id === fixtureId);
    if (fixtureProfile) return fixtureProfile;
  }
  return PROFILES.find((profile) => profile.hostnames.includes(hostname)) ?? null;
}
