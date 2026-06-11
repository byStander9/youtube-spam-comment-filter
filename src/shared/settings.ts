import type { FilterSettings } from "./types";

const SETTINGS_KEY = "filterSettings";

export const DEFAULT_SETTINGS: FilterSettings = {
  enabled: true,
  showHidden: false
};

export async function getSettings(): Promise<FilterSettings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored[SETTINGS_KEY] as Partial<FilterSettings> | undefined)
  };
}

export async function saveSettings(settings: FilterSettings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}
