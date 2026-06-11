import { detectSpam } from "./spamDetector";
import {
  applyLearningToResult,
  clearLearningProfile,
  createEmptyLearningProfile,
  getLearningStats,
  recordFeedback,
  type FeedbackLabel,
  hashCommentText,
  loadLearningProfile,
  type LearningProfile
} from "./feedbackStore";
import { commentContainerSelector, findCommentNodes, observeCommentChanges } from "./youtubeComments";
import type { FilterSettings, FilterStats, RuntimeMessage } from "../shared/types";

declare global {
  interface Window {
    __yscfInitialized?: boolean;
  }
}

const SETTINGS_KEY = "filterSettings";
const PROCESSED_ATTRIBUTE = "data-yscf-processed";
const HIDDEN_ATTRIBUTE = "data-yscf-hidden";
const REASONS_ATTRIBUTE = "data-yscf-reasons";
const HASH_ATTRIBUTE = "data-yscf-hash";
const FEEDBACK_ATTRIBUTE = "data-yscf-feedback";
const STYLE_ID = "yscf-style";
const MENU_ITEM_CLASS = "yscf-menu-item";
const MENU_SEPARATOR_CLASS = "yscf-menu-separator";
const MENU_SELECTOR = [
  "ytd-menu-popup-renderer tp-yt-paper-listbox",
  "ytd-menu-popup-renderer [role='menu']",
  "ytd-popup-container tp-yt-paper-listbox",
  "ytd-popup-container [role='menu']",
  "tp-yt-paper-listbox[role='menu']"
].join(",");

const DEFAULT_SETTINGS: FilterSettings = {
  enabled: true,
  showHidden: false
};

let settings: FilterSettings = DEFAULT_SETTINGS;
let stats: FilterStats = {
  hiddenCount: 0,
  scannedCount: 0
};
let learningProfile: LearningProfile = createEmptyLearningProfile();
let scanQueued = false;
let lastSeenUrl = location.href;
let activeFeedbackContainer: HTMLElement | null = null;

if (!window.__yscfInitialized) {
  window.__yscfInitialized = true;
  void initialize();
}

async function initialize(): Promise<void> {
  injectStyles();
  registerMessageHandlers();
  registerMenuHandlers();
  observeCommentChanges(scanSoon);
  [settings, learningProfile] = await Promise.all([
    getContentSettings(),
    loadLearningProfile()
  ]);
  scanSoon();
}

async function getContentSettings(): Promise<FilterSettings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored[SETTINGS_KEY] as Partial<FilterSettings> | undefined)
  };
}

function registerMessageHandlers(): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === "ping") {
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "scanNow") {
      scanComments();
      sendResponse({ type: "stats", stats } satisfies RuntimeMessage);
      return;
    }

    if (message.type === "settingsChanged") {
      settings = message.settings;
      applyVisibility();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "getLearningStats") {
      sendResponse({ type: "learningStats", stats: getLearningStats(learningProfile) } satisfies RuntimeMessage);
      return;
    }

    if (message.type === "clearLearningData") {
      void clearLearningData().then((stats) => {
        sendResponse({ type: "learningDataCleared", stats } satisfies RuntimeMessage);
      });
      return true;
    }

    if (message.type === "getStats") {
      sendResponse({ type: "stats", stats } satisfies RuntimeMessage);
    }
  });
}

function scanSoon(): void {
  if (scanQueued) {
    return;
  }

  scanQueued = true;
  window.setTimeout(() => {
    scanQueued = false;
    scanComments();
  }, 250);
}

function scanComments(): void {
  resetStatsAfterNavigation();

  const comments = findCommentNodes();

  for (const comment of comments) {
    if (comment.container.hasAttribute(PROCESSED_ATTRIBUTE)) {
      continue;
    }

    processComment(comment);
  }

  applyVisibility();
}

function processComment(comment: {
  container: HTMLElement;
  text: string;
  isUploader: boolean;
  likeCount: number;
}): void {
  const commentHash = hashCommentText(comment.text);
  const baseResult = detectSpam(comment.text, {
    isUploader: comment.isUploader,
    likeCount: comment.likeCount
  });
  const result = applyLearningToResult(baseResult, learningProfile, commentHash);

  comment.container.setAttribute(PROCESSED_ATTRIBUTE, "true");
  comment.container.setAttribute(REASONS_ATTRIBUTE, result.reasons.join(","));
  comment.container.setAttribute(HASH_ATTRIBUTE, commentHash);
  stats.scannedCount += 1;

  if (result.isSpam) {
    comment.container.setAttribute(HIDDEN_ATTRIBUTE, "true");
    stats.hiddenCount += 1;
  }
}

function registerMenuHandlers(): void {
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Element | null;
    const container = target?.closest<HTMLElement>(commentContainerSelector);
    if (!container) {
      return;
    }

    activeFeedbackContainer = container;
    window.setTimeout(injectFeedbackMenuItems, 0);
    window.setTimeout(injectFeedbackMenuItems, 120);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const target = event.target as Element | null;
    const container = target?.closest<HTMLElement>(commentContainerSelector);
    if (!container) {
      return;
    }

    activeFeedbackContainer = container;
    window.setTimeout(injectFeedbackMenuItems, 0);
    window.setTimeout(injectFeedbackMenuItems, 120);
  }, true);
}

function injectFeedbackMenuItems(): void {
  if (!activeFeedbackContainer) {
    return;
  }

  const menu = findOpenMenu();
  if (!menu || menu.querySelector(`.${MENU_ITEM_CLASS}`)) {
    return;
  }

  if (!activeFeedbackContainer.hasAttribute(HASH_ATTRIBUTE)) {
    scanComments();
  }

  const separator = document.createElement("div");
  separator.className = MENU_SEPARATOR_CLASS;

  const spamItem = createFeedbackMenuItem("Mark as spam", "spam");
  const notSpamItem = createFeedbackMenuItem("Mark as not spam", "not_spam");

  menu.append(separator, spamItem, notSpamItem);
  updateMenuItemState(activeFeedbackContainer);
}

function findOpenMenu(): HTMLElement | null {
  const menus = Array.from(document.querySelectorAll<HTMLElement>(MENU_SELECTOR));
  return menus.find((menu) => menu.offsetParent !== null || menu.getClientRects().length > 0) ?? null;
}

function createFeedbackMenuItem(label: string, feedback: FeedbackLabel): HTMLElement {
  const item = document.createElement("div");
  item.className = MENU_ITEM_CLASS;
  item.dataset.feedback = feedback;
  item.role = "menuitem";
  item.tabIndex = 0;
  item.textContent = label;

  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (activeFeedbackContainer) {
      void handleFeedback(activeFeedbackContainer, feedback);
    }
  });

  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (activeFeedbackContainer) {
      void handleFeedback(activeFeedbackContainer, feedback);
    }
  });

  return item;
}

async function handleFeedback(container: HTMLElement, feedback: FeedbackLabel): Promise<void> {
  const commentHash = container.getAttribute(HASH_ATTRIBUTE);
  if (!commentHash) {
    return;
  }

  const reasons = (container.getAttribute(REASONS_ATTRIBUTE) ?? "")
    .split(",")
    .map((reason) => reason.trim())
    .filter(Boolean);

  learningProfile = await recordFeedback({
    commentHash,
    label: feedback,
    reasons
  });

  container.setAttribute(FEEDBACK_ATTRIBUTE, feedback);

  if (feedback === "spam") {
    if (!container.hasAttribute(HIDDEN_ATTRIBUTE)) {
      stats.hiddenCount += 1;
    }

    container.setAttribute(HIDDEN_ATTRIBUTE, "true");
    container.setAttribute(REASONS_ATTRIBUTE, uniqueReasons([...reasons, "user-marked-spam"]).join(","));
  } else {
    if (container.hasAttribute(HIDDEN_ATTRIBUTE)) {
      stats.hiddenCount = Math.max(0, stats.hiddenCount - 1);
    }

    container.removeAttribute(HIDDEN_ATTRIBUTE);
    container.setAttribute(REASONS_ATTRIBUTE, uniqueReasons([...reasons, "user-marked-not-spam"]).join(","));
  }

  updateMenuItemState(container);
  applyVisibility();
}

function updateMenuItemState(container: HTMLElement): void {
  const feedback = container.getAttribute(FEEDBACK_ATTRIBUTE);
  const menu = findOpenMenu();
  if (!menu) {
    return;
  }

  menu.querySelectorAll<HTMLElement>(`.${MENU_ITEM_CLASS}`).forEach((item) => {
    const isSelected = item.dataset.feedback === feedback;
    item.toggleAttribute("aria-checked", isSelected);
    item.toggleAttribute("data-selected", isSelected);
  });
}

function uniqueReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons));
}

function resetStatsAfterNavigation(): void {
  if (lastSeenUrl === location.href) {
    return;
  }

  lastSeenUrl = location.href;
  stats = {
    hiddenCount: 0,
    scannedCount: 0
  };
}

async function clearLearningData() {
  await clearLearningProfile();
  learningProfile = createEmptyLearningProfile();
  resetProcessedComments();
  stats = {
    hiddenCount: 0,
    scannedCount: 0
  };
  scanSoon();

  return getLearningStats(learningProfile);
}

function resetProcessedComments(): void {
  document.querySelectorAll<HTMLElement>(commentContainerSelector).forEach((container) => {
    container.removeAttribute(PROCESSED_ATTRIBUTE);
    container.removeAttribute(HIDDEN_ATTRIBUTE);
    container.removeAttribute(REASONS_ATTRIBUTE);
    container.removeAttribute(HASH_ATTRIBUTE);
    container.removeAttribute(FEEDBACK_ATTRIBUTE);
  });
}

function applyVisibility(): void {
  document.documentElement.toggleAttribute("data-yscf-enabled", settings.enabled);
  document.documentElement.toggleAttribute("data-yscf-show-hidden", settings.showHidden);
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html[data-yscf-enabled]:not([data-yscf-show-hidden]) :is(${commentContainerSelector})[${HIDDEN_ATTRIBUTE}="true"] {
      display: none !important;
    }

    html[data-yscf-enabled][data-yscf-show-hidden] :is(${commentContainerSelector})[${HIDDEN_ATTRIBUTE}="true"] {
      opacity: 0.45;
      outline: 2px solid #d93025;
      outline-offset: 4px;
    }

    html[data-yscf-enabled][data-yscf-show-hidden] :is(${commentContainerSelector})[${HIDDEN_ATTRIBUTE}="true"]::before {
      content: "Filtered as likely spam";
      display: inline-block;
      margin: 0 0 8px 56px;
      padding: 3px 8px;
      border-radius: 4px;
      background: #d93025;
      color: #fff;
      font: 500 12px/1.4 Roboto, Arial, sans-serif;
    }

    .${MENU_SEPARATOR_CLASS} {
      height: 1px;
      margin: 6px 0;
      background: #e8eaed;
    }

    .${MENU_ITEM_CLASS} {
      display: flex;
      align-items: center;
      min-height: 36px;
      padding: 0 16px;
      color: #0f0f0f;
      cursor: pointer;
      font: 400 14px/1.4 Roboto, Arial, sans-serif;
      white-space: nowrap;
    }

    .${MENU_ITEM_CLASS}:hover,
    .${MENU_ITEM_CLASS}:focus {
      background: rgba(0, 0, 0, 0.08);
      outline: none;
    }

    .${MENU_ITEM_CLASS}[data-selected]::after {
      content: "Selected";
      margin-left: auto;
      padding-left: 16px;
      color: #606060;
      font-size: 12px;
    }
  `;
  document.documentElement.append(style);
}
