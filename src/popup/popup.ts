import "./popup.css";
import { getSettings, saveSettings } from "../shared/settings";
import type { FilterSettings, RuntimeMessage, UiLanguage } from "../shared/types";

const enabledInput = document.querySelector<HTMLInputElement>("#enabled");
const showHiddenInput = document.querySelector<HTMLInputElement>("#showHidden");
const hiddenCountElement = document.querySelector<HTMLElement>("#hiddenCount");
const scannedCountElement = document.querySelector<HTMLElement>("#scannedCount");
const statusElement = document.querySelector<HTMLElement>("#status");
const totalFeedbackElement = document.querySelector<HTMLElement>("#totalFeedback");
const spamFeedbackElement = document.querySelector<HTMLElement>("#spamFeedback");
const notSpamFeedbackElement = document.querySelector<HTMLElement>("#notSpamFeedback");
const clearLearningButton = document.querySelector<HTMLButtonElement>("#clearLearning");
const languageEnButton = document.querySelector<HTMLButtonElement>("#languageEn");
const languageKoButton = document.querySelector<HTMLButtonElement>("#languageKo");

type TranslationKey =
  | "filterEnabledTitle"
  | "filterEnabledDescription"
  | "showHiddenTitle"
  | "showHiddenDescription"
  | "hiddenComments"
  | "scannedComments"
  | "localLearning"
  | "clearLearning"
  | "feedback"
  | "spamFeedback"
  | "notSpamFeedback"
  | "openYouTubeStatus"
  | "notYouTubeStatus"
  | "scriptCommunicationFailed"
  | "scriptInjectionFailed"
  | "filterRunning"
  | "commentsNotFound"
  | "clearLearningFailed"
  | "clearLearningDone";

const TRANSLATIONS: Record<UiLanguage, Record<TranslationKey, string>> = {
  en: {
    filterEnabledTitle: "Filter enabled",
    filterEnabledDescription: "Hide comments that look like spam",
    showHiddenTitle: "Show hidden comments",
    showHiddenDescription: "Show filtered comments in a faded view",
    hiddenComments: "Hidden",
    scannedComments: "Scanned",
    localLearning: "Local learning",
    clearLearning: "Clear",
    feedback: "Feedback",
    spamFeedback: "Spam",
    notSpamFeedback: "Not spam",
    openYouTubeStatus: "Open a YouTube video page and scroll to comments.",
    notYouTubeStatus: "This extension works on YouTube video pages only.",
    scriptCommunicationFailed: "Could not communicate with the comment filter script. Refresh the page.",
    scriptInjectionFailed: "Could not inject the script. Reload the extension, then refresh the YouTube tab.",
    filterRunning: "The comment filter is running on this page.",
    commentsNotFound: "No comments found yet. Scroll to the comments and open this popup again.",
    clearLearningFailed: "Could not clear learning data. Refresh the page and try again.",
    clearLearningDone: "Local learning data has been cleared."
  },
  ko: {
    filterEnabledTitle: "필터 사용",
    filterEnabledDescription: "스팸으로 보이는 댓글 숨김",
    showHiddenTitle: "숨긴 댓글 표시",
    showHiddenDescription: "숨기지 않고 흐리게 표시",
    hiddenComments: "숨긴 댓글",
    scannedComments: "검사한 댓글",
    localLearning: "로컬 학습",
    clearLearning: "초기화",
    feedback: "피드백",
    spamFeedback: "스팸",
    notSpamFeedback: "정상",
    openYouTubeStatus: "YouTube 영상 페이지에서 댓글 영역을 열어주세요.",
    notYouTubeStatus: "YouTube 영상 페이지에서만 동작합니다.",
    scriptCommunicationFailed: "댓글 필터 스크립트와 통신하지 못했습니다. 페이지를 새로고침해 주세요.",
    scriptInjectionFailed: "스크립트를 주입하지 못했습니다. 확장을 새로고침한 뒤 YouTube 탭을 새로고침해 주세요.",
    filterRunning: "댓글 필터가 현재 페이지에서 동작 중입니다.",
    commentsNotFound: "댓글을 아직 찾지 못했습니다. 댓글 영역까지 스크롤한 뒤 다시 열어주세요.",
    clearLearningFailed: "학습 데이터를 초기화하지 못했습니다. 페이지를 새로고침해 주세요.",
    clearLearningDone: "로컬 학습 데이터를 초기화했습니다."
  }
};

let currentSettings: FilterSettings | null = null;

void initialize();

async function initialize(): Promise<void> {
  if (
    !enabledInput ||
    !showHiddenInput ||
    !hiddenCountElement ||
    !scannedCountElement ||
    !statusElement ||
    !totalFeedbackElement ||
    !spamFeedbackElement ||
    !notSpamFeedbackElement ||
    !clearLearningButton ||
    !languageEnButton ||
    !languageKoButton
  ) {
    return;
  }

  const settings = await getSettings();
  currentSettings = settings;
  renderSettings(settings);
  applyLanguage(settings.language);
  await refreshStats();

  enabledInput.addEventListener("change", () => {
    void updateSettingsFromPopup({
      enabled: enabledInput.checked,
      showHidden: showHiddenInput.checked,
      language: getCurrentLanguage()
    });
  });

  showHiddenInput.addEventListener("change", () => {
    void updateSettingsFromPopup({
      enabled: enabledInput.checked,
      showHidden: showHiddenInput.checked,
      language: getCurrentLanguage()
    });
  });

  clearLearningButton.addEventListener("click", () => {
    void clearLearningData();
  });

  languageEnButton.addEventListener("click", () => {
    void changeLanguage("en");
  });

  languageKoButton.addEventListener("click", () => {
    void changeLanguage("ko");
  });
}

function renderSettings(settings: FilterSettings): void {
  enabledInput!.checked = settings.enabled;
  showHiddenInput!.checked = settings.showHidden;
}

async function changeLanguage(language: UiLanguage): Promise<void> {
  await updateSettingsFromPopup({
    enabled: enabledInput!.checked,
    showHidden: showHiddenInput!.checked,
    language
  });
  applyLanguage(language);
  await refreshStats();
}

async function updateSettingsFromPopup(settings: FilterSettings): Promise<void> {
  currentSettings = settings;
  await saveSettings(settings);

  const tab = await getActiveTab();
  if (await ensureContentScript(tab)) {
    await chrome.tabs
      .sendMessage(tab.id!, { type: "settingsChanged", settings } satisfies RuntimeMessage)
      .catch(() => undefined);
  }

  await refreshStats();
}

async function clearLearningData(): Promise<void> {
  const tab = await getActiveTab();
  if (!(await ensureContentScript(tab))) {
    return;
  }

  clearLearningButton!.disabled = true;
  const response = await chrome.tabs
    .sendMessage(tab.id!, { type: "clearLearningData" } satisfies RuntimeMessage)
    .catch(() => undefined);
  clearLearningButton!.disabled = false;

  if (response?.type !== "learningDataCleared") {
    setStatusKey("clearLearningFailed");
    return;
  }

  renderLearningStats(response.stats);
  setStatusKey("clearLearningDone");
  await refreshStats();
}

async function refreshStats(): Promise<void> {
  const tab = await getActiveTab();
  if (!(await ensureContentScript(tab))) {
    return;
  }

  const response = await chrome.tabs
    .sendMessage(tab.id!, { type: "scanNow" } satisfies RuntimeMessage)
    .catch(() => undefined);

  if (response?.type !== "stats") {
    setStatusKey("scriptCommunicationFailed");
    return;
  }

  hiddenCountElement!.textContent = String(response.stats.hiddenCount);
  scannedCountElement!.textContent = String(response.stats.scannedCount);
  await refreshLearningStats(tab);
  setStatus(
    response.stats.scannedCount > 0
      ? t("filterRunning")
      : t("commentsNotFound")
  );
}

async function refreshLearningStats(tab: chrome.tabs.Tab): Promise<void> {
  const response = await chrome.tabs
    .sendMessage(tab.id!, { type: "getLearningStats" } satisfies RuntimeMessage)
    .catch(() => undefined);

  if (response?.type === "learningStats") {
    renderLearningStats(response.stats);
  }
}

function renderLearningStats(stats: {
  totalFeedback: number;
  spamFeedback: number;
  notSpamFeedback: number;
}): void {
  totalFeedbackElement!.textContent = String(stats.totalFeedback);
  spamFeedbackElement!.textContent = String(stats.spamFeedback);
  notSpamFeedbackElement!.textContent = String(stats.notSpamFeedback);
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tab: chrome.tabs.Tab): Promise<boolean> {
  if (tab.id === undefined || !tab.url?.startsWith("https://www.youtube.com/watch")) {
    setStatusKey("notYouTubeStatus");
    return false;
  }

  const ping = await chrome.tabs
    .sendMessage(tab.id, { type: "ping" } satisfies RuntimeMessage)
    .catch(() => undefined);

  if (ping?.ok) {
    return true;
  }

  await chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    })
    .catch(() => undefined);

  await wait(100);

  const retry = await chrome.tabs
    .sendMessage(tab.id, { type: "ping" } satisfies RuntimeMessage)
    .catch(() => undefined);

  if (!retry?.ok) {
    setStatusKey("scriptInjectionFailed");
    return false;
  }

  return true;
}

function setStatus(message: string): void {
  statusElement!.textContent = message;
}

function setStatusKey(key: TranslationKey): void {
  setStatus(t(key));
}

function applyLanguage(language: UiLanguage): void {
  document.documentElement.lang = language;

  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n as TranslationKey | undefined;
    if (key) {
      element.textContent = t(key, language);
    }
  });

  languageEnButton!.toggleAttribute("aria-pressed", language === "en");
  languageKoButton!.toggleAttribute("aria-pressed", language === "ko");
}

function t(key: TranslationKey, language = getCurrentLanguage()): string {
  return TRANSLATIONS[language][key];
}

function getCurrentLanguage(): UiLanguage {
  return currentSettings?.language ?? "en";
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
