export type FilterSettings = {
  enabled: boolean;
  showHidden: boolean;
};

export type FilterStats = {
  hiddenCount: number;
  scannedCount: number;
};

export type RuntimeMessage =
  | { type: "ping" }
  | { type: "scanNow" }
  | { type: "settingsChanged"; settings: FilterSettings }
  | { type: "getStats" }
  | { type: "stats"; stats: FilterStats };
