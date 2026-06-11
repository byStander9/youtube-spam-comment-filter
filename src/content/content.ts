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
const FEEDBACK_CONTROLS_CLASS = "yscf-feedback-controls";

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

    renderFeedbackControls(comment.container);
  }

  applyVisibility();
}

function renderFeedbackControls(container: HTMLElement): void {
  if (container.querySelector(`.${FEEDBACK_CONTROLS_CLASS}`)) {
    return;
  }

  const controls = document.createElement("div");
  controls.className = FEEDBACK_CONTROLS_CLASS;

  const spamButton = createFeedbackButton("Spam", "spam");
  const notSpamButton = createFeedbackButton("Not spam", "not_spam");

  controls.append(spamButton, notSpamButton);
  container.prepend(controls);
}

function createFeedbackButton(label: string, feedback: FeedbackLabel): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.feedback = feedback;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLButtonElement;
    const container = target.closest<HTMLElement>(commentContainerSelector);
    if (container) {
      void handleFeedback(container, feedback);
    }
  });

  return button;
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

  updateFeedbackControls(container, feedback);
  applyVisibility();
}

function updateFeedbackControls(container: HTMLElement, feedback: FeedbackLabel): void {
  const controls = container.querySelector<HTMLElement>(`.${FEEDBACK_CONTROLS_CLASS}`);
  if (!controls) {
    return;
  }

  controls.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const isSelected = button.dataset.feedback === feedback;
    button.toggleAttribute("aria-pressed", isSelected);
    button.disabled = isSelected;
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

    const controls = container.querySelector<HTMLElement>(`.${FEEDBACK_CONTROLS_CLASS}`);
    controls?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = false;
      button.removeAttribute("aria-pressed");
    });
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

    :is(${commentContainerSelector}) .${FEEDBACK_CONTROLS_CLASS} {
      display: flex;
      gap: 6px;
      margin: 0 0 6px 56px;
      opacity: 0.28;
      transition: opacity 120ms ease;
    }

    :is(${commentContainerSelector}):hover .${FEEDBACK_CONTROLS_CLASS},
    :is(${commentContainerSelector}) .${FEEDBACK_CONTROLS_CLASS}:focus-within,
    :is(${commentContainerSelector})[${HIDDEN_ATTRIBUTE}="true"] .${FEEDBACK_CONTROLS_CLASS} {
      opacity: 1;
    }

    :is(${commentContainerSelector}) .${FEEDBACK_CONTROLS_CLASS} button {
      min-height: 24px;
      padding: 2px 8px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      background: #fff;
      color: #3c4043;
      cursor: pointer;
      font: 500 12px/1.4 Roboto, Arial, sans-serif;
    }

    :is(${commentContainerSelector}) .${FEEDBACK_CONTROLS_CLASS} button:hover {
      background: #f1f3f4;
    }

    :is(${commentContainerSelector}) .${FEEDBACK_CONTROLS_CLASS} button[aria-pressed="true"] {
      border-color: #1a73e8;
      background: #e8f0fe;
      color: #174ea6;
      cursor: default;
    }
  `;
  document.documentElement.append(style);
}
