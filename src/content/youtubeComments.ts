export type CommentNode = {
  container: HTMLElement;
  text: string;
  isUploader: boolean;
  likeCount: number;
};

const COMMENT_CONTAINER_SELECTOR = [
  "ytd-comment-thread-renderer",
  "ytd-comment-renderer",
  "ytd-comment-view-model"
].join(",");
const COMMENT_TEXT_SELECTOR = [
  "#content-text",
  "yt-attributed-string#content-text",
  ".yt-core-attributed-string"
].join(",");
const UPLOADER_BADGE_SELECTOR = "ytd-author-comment-badge-renderer";
const VOTE_COUNT_SELECTOR = [
  "#vote-count-middle",
  "#vote-count-left",
  "[id*='vote-count']"
].join(",");

export function findCommentNodes(root: ParentNode = document): CommentNode[] {
  return Array.from(root.querySelectorAll<HTMLElement>(COMMENT_CONTAINER_SELECTOR))
    .filter((container) => !container.parentElement?.closest(COMMENT_CONTAINER_SELECTOR))
    .map((container) => {
      const textElement = container.querySelector<HTMLElement>(COMMENT_TEXT_SELECTOR);

      return {
        container,
        text: textElement?.innerText ?? "",
        isUploader: isUploaderComment(container),
        likeCount: getLikeCount(container)
      };
    })
    .filter((comment) => comment.text.trim().length > 0);
}

export const commentContainerSelector = COMMENT_CONTAINER_SELECTOR;

export function observeCommentChanges(onChange: () => void): MutationObserver {
  const observer = new MutationObserver(() => onChange());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  return observer;
}

export function parseLikeCount(rawText: string): number {
  const text = rawText.replace(/\s+/g, "").trim().toLowerCase();

  if (!text) {
    return 0;
  }

  const match = text.match(/(\d+(?:[.,]\d+)?)(억|만|천|b|m|k)?/i);
  if (!match) {
    return 0;
  }

  const rawNumber = match[1];
  const hasUnit = match[2] !== undefined;
  const normalizedNumber = hasUnit
    ? rawNumber.replace(",", ".")
    : rawNumber.replace(/[,.](?=\d{3}\b)/g, "");
  const value = Number(normalizedNumber);
  if (!Number.isFinite(value)) {
    return 0;
  }

  const unit = match[2]?.toLowerCase();
  const multiplier = unit === "억" || unit === "b"
    ? 100_000_000
    : unit === "만"
      ? 10_000
      : unit === "천" || unit === "k"
        ? 1_000
        : unit === "m"
          ? 1_000_000
          : 1;

  return Math.floor(value * multiplier);
}

function isUploaderComment(container: HTMLElement): boolean {
  return container.querySelector(UPLOADER_BADGE_SELECTOR) !== null;
}

function getLikeCount(container: HTMLElement): number {
  const voteElement = container.querySelector<HTMLElement>(VOTE_COUNT_SELECTOR);
  const visibleTextCount = parseLikeCount(voteElement?.innerText ?? "");

  if (visibleTextCount > 0) {
    return visibleTextCount;
  }

  const labelledElement = Array.from(container.querySelectorAll<HTMLElement>("[aria-label]"))
    .find((element) => /like|좋아요/i.test(element.getAttribute("aria-label") ?? ""));

  return parseLikeCount(labelledElement?.getAttribute("aria-label") ?? "");
}
