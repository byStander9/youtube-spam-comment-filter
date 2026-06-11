import { describe, expect, it } from "vitest";
import { detectSpam } from "./spamDetector";

describe("detectSpam", () => {
  it("flags promotional comments with external links", () => {
    const result = detectSpam("무료 투자 상담은 t.me/example 에서 확인하세요");

    expect(result.isSpam).toBe(true);
    expect(result.reasons).toContain("link");
    expect(result.reasons).toContain("money-promo");
  });

  it("keeps ordinary comments visible", () => {
    const result = detectSpam("이 장면 설명이 정말 좋네요. 다음 영상도 기대됩니다.");

    expect(result.isSpam).toBe(false);
  });

  it("keeps casual repeated letters visible", () => {
    const result = detectSpam("ㅋㅋㅋㅋㅋㅋㅋㅋ 이 부분 진짜 웃기네요!!!!!");

    expect(result.isSpam).toBe(false);
  });

  it("flags repeated promotional tokens", () => {
    const result = detectSpam("profit profit profit now");

    expect(result.isSpam).toBe(true);
    expect(result.reasons).toContain("repeated-promo-token");
  });

  it("exempts uploader comments even when promotional", () => {
    const result = detectSpam("무료 이벤트 참여 링크는 t.me/example 입니다", {
      isUploader: true
    });

    expect(result.isSpam).toBe(false);
    expect(result.reasons).toContain("uploader-exempt");
  });

  it("exempts comments with many likes", () => {
    const result = detectSpam("crypto profit giveaway t.me/example", {
      likeCount: 250
    });

    expect(result.isSpam).toBe(false);
    expect(result.reasons).toContain("high-like-exempt");
  });

  it("does not hide a plain link without spam signals", () => {
    const result = detectSpam("관련 자료는 https://example.com 에 정리되어 있습니다.");

    expect(result.isSpam).toBe(false);
  });

  it("keeps comments that criticize stock trading rooms visible", () => {
    const result = detectSpam("리딩방 문제점을 잘 지적한 영상이라 공감합니다.");

    expect(result.isSpam).toBe(false);
    expect(result.reasons).toContain("money-discussion");
  });

  it("does not treat a financial topic word alone as spam", () => {
    const result = detectSpam("이 영상 보고 리딩방이라는 단어를 처음 알았습니다.");

    expect(result.isSpam).toBe(false);
    expect(result.reasons).toContain("money-topic");
  });

  it("flags financial topic comments when they include solicitation", () => {
    const result = detectSpam("무료 리딩방 가입 문의 주세요");

    expect(result.isSpam).toBe(true);
    expect(result.reasons).toContain("money-promo");
  });
});
