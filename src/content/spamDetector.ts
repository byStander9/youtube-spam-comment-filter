export type SpamDetectionResult = {
  isSpam: boolean;
  reasons: string[];
  score: number;
};

export type SpamDetectionContext = {
  isUploader?: boolean;
  likeCount?: number;
  highLikeThreshold?: number;
};

const DEFAULT_HIGH_LIKE_THRESHOLD = 100;
const URL_PATTERN = /(https?:\/\/|www\.|bit\.ly|t\.me\/|open\.kakao\.com|wa\.me\/|discord\.gg\/)/i;
const URL_MATCH_PATTERN = /(https?:\/\/|www\.|bit\.ly|t\.me\/|open\.kakao\.com|wa\.me\/|discord\.gg\/)/gi;
const HASHTAG_OR_MENTION_PATTERN = /[#@][\p{L}\p{N}_-]+/gu;
const CONTACT_PATTERNS: RegExp[] = [
  /telegram|whatsapp|line\s?id|kakao|카톡|텔레그램|오픈채팅|오픈\s?채팅|디스코드|discord/i,
  /dm\s?주세요|dm\s?me|contact\s?me|message\s?me|프로필\s?확인|check\s?my\s?profile/i
];
const HIGH_CONFIDENCE_MONEY_PROMO_PATTERNS: RegExp[] = [
  /무료\s?(투자|종목|주식)?\s?상담|수익\s?보장|원금\s?보장|고수익|급등주\s?추천|종목\s?추천/i,
  /리딩방\s?(입장|가입|초대|문의|추천|운영|모집)|단타\s?방|vip\s?방/i,
  /guaranteed\s?profit|trading\s?signals|investment\s?advice|crypto\s?giveaway/i
];
const MONEY_TOPIC_PATTERNS: RegExp[] = [
  /투자|수익|부업|재테크|코인|비트코인|리딩방|급등주|주식|종목/i,
  /crypto|profit|investment|forex|trading|passive\s?income/i
];
const PROMO_PATTERNS: RegExp[] = [
  /giveaway|airdrop|free\s?gift|winner|prize|promo|limited\s?time/i,
  /구독\s?이벤트|무료\s?나눔|당첨|이벤트\s?참여|선착순|쿠폰/i
];
const CALL_TO_ACTION_PATTERNS: RegExp[] = [
  /click|join|subscribe|follow|visit|claim|sign\s?up|register/i,
  /클릭|참여|가입|입장|방문|확인하세요|신청|받아가세요/i
];
const SOLICITATION_PATTERNS: RegExp[] = [
  /문의|상담|입장|가입|초대|모집|추천|신청|주세요|연락/i,
  /join|contact|message|apply|register|sign\s?up|claim/i
];
const CRITICISM_OR_DISCUSSION_PATTERNS: RegExp[] = [
  /문제|문제점|사기|피해|조심|주의|비판|고발|폭로|위험|불법|당하지|공감|인정/i,
  /scam|fraud|avoid|warning|problem|critic|expose|danger|illegal/i
];
const SUSPICIOUS_TOKEN_PATTERN = /투자|수익|무료|코인|profit|crypto|forex|airdrop|giveaway|winner|telegram|whatsapp|카톡|텔레그램/i;

export function detectSpam(rawText: string, context: SpamDetectionContext = {}): SpamDetectionResult {
  const text = normalizeCommentText(rawText);
  const reasons: string[] = [];
  let score = 0;

  if (!text) {
    return { isSpam: false, reasons, score };
  }

  if (context.isUploader) {
    return { isSpam: false, reasons: ["uploader-exempt"], score };
  }

  if ((context.likeCount ?? 0) >= (context.highLikeThreshold ?? DEFAULT_HIGH_LIKE_THRESHOLD)) {
    return { isSpam: false, reasons: ["high-like-exempt"], score };
  }

  const hasLink = URL_PATTERN.test(text);
  const hasContact = matchesAny(text, CONTACT_PATTERNS);
  const hasHighConfidenceMoneyPromo = matchesAny(text, HIGH_CONFIDENCE_MONEY_PROMO_PATTERNS);
  const hasMoneyTopic = matchesAny(text, MONEY_TOPIC_PATTERNS);
  const hasPromotion = matchesAny(text, PROMO_PATTERNS);
  const hasCallToAction = matchesAny(text, CALL_TO_ACTION_PATTERNS);
  const hasSolicitation = matchesAny(text, SOLICITATION_PATTERNS);
  const isCriticalDiscussion = hasMoneyTopic && matchesAny(text, CRITICISM_OR_DISCUSSION_PATTERNS);

  if (hasLink) {
    score += 2;
    reasons.push("link");
  }

  if (hasContact) {
    score += 2;
    reasons.push("contact");
  }

  if (hasHighConfidenceMoneyPromo) {
    score += 3;
    reasons.push("money-promo");
  } else if (hasMoneyTopic) {
    reasons.push(isCriticalDiscussion ? "money-discussion" : "money-topic");

    if (!isCriticalDiscussion) {
      const hasPromotionContext = hasLink || hasContact || hasPromotion || hasCallToAction || hasSolicitation;
      score += hasPromotionContext ? 2 : 1;

      if (hasPromotionContext) {
        reasons.push("money-context");
      }
    }
  }

  if (hasPromotion) {
    score += 2;
    reasons.push("promotion");
  }

  if (hasCallToAction) {
    score += 1;
    reasons.push("call-to-action");
  }

  if (hasRepeatedSuspiciousToken(text)) {
    score += 2;
    reasons.push("repeated-promo-token");
  }

  if (hasMultipleLinks(text)) {
    score += 2;
    reasons.push("multi-link");
  }

  if (hasExcessiveSymbols(text)) {
    score += 1;
    reasons.push("symbol-heavy");
  }

  if (countMatches(text, HASHTAG_OR_MENTION_PATTERN) >= 5) {
    score += 1;
    reasons.push("tag-heavy");
  }

  if (isShortSuspiciousPitch(text)) {
    score += 2;
    reasons.push("short-promo");
  }

  return {
    isSpam: score >= 3,
    reasons,
    score
  };
}

function normalizeCommentText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasRepeatedSuspiciousToken(text: string): boolean {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  const counts = new Map<string, number>();

  for (const token of tokens) {
    if (token.length < 3 || !SUSPICIOUS_TOKEN_PATTERN.test(token)) {
      continue;
    }

    const nextCount = (counts.get(token) ?? 0) + 1;
    if (nextCount >= 3) {
      return true;
    }

    counts.set(token, nextCount);
  }

  return false;
}

function hasExcessiveSymbols(text: string): boolean {
  const symbolCount = countMatches(text, /[!$%*=_~🔥💰🚀👇👉❤️⭐]/gu);
  const symbolRatio = symbolCount / Math.max(text.length, 1);
  return symbolCount >= 8 || (symbolCount >= 4 && symbolRatio > 0.25);
}

function hasMultipleLinks(text: string): boolean {
  return countMatches(text, URL_MATCH_PATTERN) >= 2;
}

function isShortSuspiciousPitch(text: string): boolean {
  return text.length < 18 && /(dm|수익|무료|코인|톡|profit|crypto|airdrop|👇|👉)/i.test(text);
}

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}
