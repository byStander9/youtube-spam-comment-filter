import "./popup.css";
import { getSettings, saveSettings } from "../shared/settings";
import type { FilterSettings, RuntimeMessage } from "../shared/types";

const enabledInput = document.querySelector<HTMLInputElement>("#enabled");
const showHiddenInput = document.querySelector<HTMLInputElement>("#showHidden");
const hiddenCountElement = document.querySelector<HTMLElement>("#hiddenCount");
const scannedCountElement = document.querySelector<HTMLElement>("#scannedCount");
const statusElement = document.querySelector<HTMLElement>("#status");

void initialize();

async function initialize(): Promise<void> {
  if (!enabledInput || !showHiddenInput || !hiddenCountElement || !scannedCountElement || !statusElement) {
    return;
  }

  const settings = await getSettings();
  renderSettings(settings);
  await refreshStats();

  enabledInput.addEventListener("change", () => {
    void updateSettings({
      enabled: enabledInput.checked,
      showHidden: showHiddenInput.checked
    });
  });

  showHiddenInput.addEventListener("change", () => {
    void updateSettings({
      enabled: enabledInput.checked,
      showHidden: showHiddenInput.checked
    });
  });
}

function renderSettings(settings: FilterSettings): void {
  enabledInput!.checked = settings.enabled;
  showHiddenInput!.checked = settings.showHidden;
}

async function updateSettings(settings: FilterSettings): Promise<void> {
  await saveSettings(settings);

  const tab = await getActiveTab();
  if (await ensureContentScript(tab)) {
    await chrome.tabs
      .sendMessage(tab.id!, { type: "settingsChanged", settings } satisfies RuntimeMessage)
      .catch(() => undefined);
  }

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
    setStatus("댓글 필터 스크립트와 통신하지 못했습니다. 페이지를 새로고침해 주세요.");
    return;
  }

  hiddenCountElement!.textContent = String(response.stats.hiddenCount);
  scannedCountElement!.textContent = String(response.stats.scannedCount);
  setStatus(
    response.stats.scannedCount > 0
      ? "댓글 필터가 현재 페이지에서 동작 중입니다."
      : "댓글을 아직 찾지 못했습니다. 댓글 영역까지 스크롤한 뒤 다시 열어주세요."
  );
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tab: chrome.tabs.Tab): Promise<boolean> {
  if (tab.id === undefined || !tab.url?.startsWith("https://www.youtube.com/watch")) {
    setStatus("YouTube 영상 페이지에서만 동작합니다.");
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
    setStatus("스크립트를 주입하지 못했습니다. 확장을 새로고침한 뒤 YouTube 탭을 새로고침해 주세요.");
    return false;
  }

  return true;
}

function setStatus(message: string): void {
  statusElement!.textContent = message;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
