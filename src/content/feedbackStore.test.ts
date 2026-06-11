import { describe, expect, it } from "vitest";
import {
  applyFeedbackToProfile,
  applyLearningToResult,
  createEmptyLearningProfile,
  getLearningStats,
  hashCommentText
} from "./feedbackStore";

describe("feedbackStore", () => {
  it("stores feedback without keeping raw comment text", () => {
    const hash = hashCommentText("무료 투자 상담은 t.me/example");
    const profile = applyFeedbackToProfile(createEmptyLearningProfile(), {
      commentHash: hash,
      label: "spam",
      reasons: ["link", "money-promo"],
      now: 100
    });

    expect(profile.exactFeedback[hash]?.label).toBe("spam");
    expect(JSON.stringify(profile)).not.toContain("무료 투자 상담");
  });

  it("uses exact not-spam feedback as an override", () => {
    const hash = hashCommentText("https://example.com 참고 자료입니다");
    const profile = applyFeedbackToProfile(createEmptyLearningProfile(), {
      commentHash: hash,
      label: "not_spam",
      reasons: ["link"],
      now: 100
    });

    const result = applyLearningToResult(
      { isSpam: true, reasons: ["link", "promotion"], score: 4 },
      profile,
      hash
    );

    expect(result.isSpam).toBe(false);
    expect(result.reasons).toContain("user-marked-not-spam");
  });

  it("keeps uploader and high-like exemptions stronger than feedback", () => {
    const hash = hashCommentText("스팸처럼 보이는 업로더 댓글");
    const profile = applyFeedbackToProfile(createEmptyLearningProfile(), {
      commentHash: hash,
      label: "spam",
      reasons: ["money-promo"],
      now: 100
    });

    const result = applyLearningToResult(
      { isSpam: false, reasons: ["uploader-exempt"], score: 0 },
      profile,
      hash
    );

    expect(result.isSpam).toBe(false);
    expect(result.reasons).toEqual(["uploader-exempt"]);
  });

  it("summarizes learned feedback", () => {
    const profile = applyFeedbackToProfile(createEmptyLearningProfile(), {
      commentHash: "abc",
      label: "spam",
      reasons: ["contact"],
      now: 100
    });

    expect(getLearningStats(profile)).toEqual({
      totalFeedback: 1,
      spamFeedback: 1,
      notSpamFeedback: 0,
      learnedSignals: 1,
      exactRules: 1
    });
  });
});
