export type UiLanguage = "en" | "ko";

export type FilterSettings = {
  enabled: boolean;
  showHidden: boolean;
  language: UiLanguage;
};

export type FilterStats = {
  hiddenCount: number;
  scannedCount: number;
};

export type LearningStats = {
  totalFeedback: number;
  spamFeedback: number;
  notSpamFeedback: number;
  learnedSignals: number;
  exactRules: number;
};

export type RuntimeMessage =
  | { type: "ping" }
  | { type: "scanNow" }
  | { type: "getLearningStats" }
  | { type: "clearLearningData" }
  | { type: "settingsChanged"; settings: FilterSettings }
  | { type: "getStats" }
  | { type: "stats"; stats: FilterStats }
  | { type: "learningStats"; stats: LearningStats }
  | { type: "learningDataCleared"; stats: LearningStats };
