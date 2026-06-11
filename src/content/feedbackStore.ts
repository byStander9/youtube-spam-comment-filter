import type { SpamDetectionResult } from "./spamDetector";

export type FeedbackLabel = "spam" | "not_spam";

export type ExactFeedback = {
  label: FeedbackLabel;
  count: number;
  updatedAt: number;
};

export type LearningProfile = {
  version: 1;
  totalFeedback: number;
  spamFeedback: number;
  notSpamFeedback: number;
  signalWeights: Record<string, number>;
  exactFeedback: Record<string, ExactFeedback>;
};

export type LearningStats = {
  totalFeedback: number;
  spamFeedback: number;
  notSpamFeedback: number;
  learnedSignals: number;
  exactRules: number;
};

export type FeedbackInput = {
  commentHash: string;
  label: FeedbackLabel;
  reasons: string[];
  now?: number;
};

const LEARNING_PROFILE_KEY = "learningProfile";
const MAX_EXACT_FEEDBACK = 5_000;
const MIN_SIGNAL_WEIGHT = -5;
const MAX_SIGNAL_WEIGHT = 5;

export async function loadLearningProfile(): Promise<LearningProfile> {
  const stored = await chrome.storage.local.get(LEARNING_PROFILE_KEY);
  return normalizeProfile(stored[LEARNING_PROFILE_KEY]);
}

export async function saveLearningProfile(profile: LearningProfile): Promise<void> {
  await chrome.storage.local.set({ [LEARNING_PROFILE_KEY]: profile });
}

export async function clearLearningProfile(): Promise<void> {
  await chrome.storage.local.remove(LEARNING_PROFILE_KEY);
}

export async function recordFeedback(input: FeedbackInput): Promise<LearningProfile> {
  const nextProfile = applyFeedbackToProfile(await loadLearningProfile(), input);
  await saveLearningProfile(nextProfile);
  return nextProfile;
}

export function createEmptyLearningProfile(): LearningProfile {
  return {
    version: 1,
    totalFeedback: 0,
    spamFeedback: 0,
    notSpamFeedback: 0,
    signalWeights: {},
    exactFeedback: {}
  };
}

export function applyFeedbackToProfile(profile: LearningProfile, input: FeedbackInput): LearningProfile {
  const nextProfile = normalizeProfile(profile);
  const now = input.now ?? Date.now();
  const exact = nextProfile.exactFeedback[input.commentHash];

  nextProfile.totalFeedback += 1;
  if (input.label === "spam") {
    nextProfile.spamFeedback += 1;
  } else {
    nextProfile.notSpamFeedback += 1;
  }

  nextProfile.exactFeedback[input.commentHash] = {
    label: input.label,
    count: (exact?.count ?? 0) + 1,
    updatedAt: now
  };

  for (const reason of getLearnableReasons(input.reasons)) {
    const delta = input.label === "spam" ? 1 : -1;
    nextProfile.signalWeights[reason] = clamp(
      (nextProfile.signalWeights[reason] ?? 0) + delta,
      MIN_SIGNAL_WEIGHT,
      MAX_SIGNAL_WEIGHT
    );
  }

  trimExactFeedback(nextProfile);
  return nextProfile;
}

export function applyLearningToResult(
  result: SpamDetectionResult,
  profile: LearningProfile,
  commentHash: string
): SpamDetectionResult {
  if (isHardExempt(result)) {
    return result;
  }

  const exact = profile.exactFeedback[commentHash];
  if (exact?.label === "spam") {
    return {
      isSpam: true,
      reasons: uniqueReasons([...result.reasons, "user-marked-spam"]),
      score: Math.max(result.score, 3)
    };
  }

  if (exact?.label === "not_spam") {
    return {
      isSpam: false,
      reasons: uniqueReasons([...result.reasons, "user-marked-not-spam"]),
      score: Math.min(result.score, 2)
    };
  }

  const rawAdjustment = getLearnableReasons(result.reasons)
    .reduce((sum, reason) => sum + (profile.signalWeights[reason] ?? 0), 0);
  const adjustment = clamp(rawAdjustment, -2, 2);

  if (adjustment === 0) {
    return result;
  }

  const adjustedScore = Math.max(0, result.score + adjustment);
  return {
    isSpam: adjustedScore >= 3,
    reasons: uniqueReasons([...result.reasons, "learned-adjustment"]),
    score: adjustedScore
  };
}

export function getLearningStats(profile: LearningProfile): LearningStats {
  return {
    totalFeedback: profile.totalFeedback,
    spamFeedback: profile.spamFeedback,
    notSpamFeedback: profile.notSpamFeedback,
    learnedSignals: Object.keys(profile.signalWeights).length,
    exactRules: Object.keys(profile.exactFeedback).length
  };
}

export function hashCommentText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  let hash = 0x811c9dc5;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeProfile(value: unknown): LearningProfile {
  const profile = value as Partial<LearningProfile> | undefined;

  return {
    version: 1,
    totalFeedback: Number(profile?.totalFeedback ?? 0),
    spamFeedback: Number(profile?.spamFeedback ?? 0),
    notSpamFeedback: Number(profile?.notSpamFeedback ?? 0),
    signalWeights: { ...(profile?.signalWeights ?? {}) },
    exactFeedback: { ...(profile?.exactFeedback ?? {}) }
  };
}

function getLearnableReasons(reasons: string[]): string[] {
  return reasons.filter((reason) => !reason.endsWith("-exempt") && !reason.startsWith("user-marked"));
}

function isHardExempt(result: SpamDetectionResult): boolean {
  return result.reasons.includes("uploader-exempt") || result.reasons.includes("high-like-exempt");
}

function trimExactFeedback(profile: LearningProfile): void {
  const entries = Object.entries(profile.exactFeedback);
  if (entries.length <= MAX_EXACT_FEEDBACK) {
    return;
  }

  const trimmed = entries
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_EXACT_FEEDBACK);

  profile.exactFeedback = Object.fromEntries(trimmed);
}

function uniqueReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
