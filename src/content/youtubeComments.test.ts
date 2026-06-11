import { describe, expect, it } from "vitest";
import { parseLikeCount } from "./youtubeComments";

describe("parseLikeCount", () => {
  it("parses plain and grouped numbers", () => {
    expect(parseLikeCount("123")).toBe(123);
    expect(parseLikeCount("1,234")).toBe(1234);
  });

  it("parses Korean compact units", () => {
    expect(parseLikeCount("1.2천")).toBe(1200);
    expect(parseLikeCount("3.4만")).toBe(34000);
  });

  it("parses English compact units", () => {
    expect(parseLikeCount("1.5K")).toBe(1500);
    expect(parseLikeCount("2M")).toBe(2000000);
  });
});
