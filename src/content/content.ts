import { detectSpam } from "./spamDetector";
import {
  applyLearningToResult,
  createEmptyLearningProfile,
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
const STYLE_ID = "yscf-style";

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

if (!window.__yscfInitialized) {
  window.__yscfInitialized = true;
  void initialize();
}

async function initialize(): Promise<void> {
  injectStyles();
  registerMessageHandlers();
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

  applyVisibility();
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
  `;
  document.documentElement.append(style);
}
