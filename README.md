# YouTube Spam Comment Filter

[한국어 README](./README.ko.md)

A Chrome extension that hides likely spam comments on YouTube video pages while preserving uploader comments and highly liked comments.

## Features

- Filters comments directly on YouTube watch pages.
- Handles dynamically loaded comments while scrolling.
- Lets you turn filtering on or off from the extension popup.
- Shows scanned and hidden comment counts.
- Can reveal filtered comments in a faded debug view.
- Lets you mark comments as `Spam` or `Not spam` while browsing.
- Improves filtering locally from your feedback.
- Shows local learning stats and lets you clear learned data from the popup.
- Exempts comments written by the video uploader.
- Exempts comments with many likes. The default threshold is 100 likes.
- Avoids treating casual repeated letters such as `ㅋㅋㅋㅋ`, `ㅎㅎㅎㅎ`, or `!!!!!` as spam by themselves.

## Filtering Approach

The extension uses local rule-based heuristics. It does not send comment text to an external server.

Current spam signals include:

- Suspicious links
- Telegram, KakaoTalk, WhatsApp, Discord, DM, or profile-check invitations
- Investment, crypto, profit, side-job, or forex promotion
- Giveaway, airdrop, coupon, prize, or event promotion
- Click, join, register, claim, or similar call-to-action wording
- Repeated promotional tokens
- Multiple links
- Excessive hashtags or mentions
- Very short promotional pitches

Filtering is score-based, so a plain link or casual repeated expression should not be enough to hide a comment.

## Local Learning

The extension can learn from your own feedback without any external program or server.

- Comment feedback is stored in Chrome extension local storage.
- Raw comment text is not stored. The extension stores a comment hash, matched filter signals, and your feedback label.
- Exact feedback can override future decisions for the same comment text.
- Repeated feedback adjusts the weight of signals such as `link`, `contact`, or `money-promo`.
- Learning stays on your browser and is not shared with other users.
- You can clear all learned feedback from the extension popup.

## Local Setup

Install dependencies:

```powershell
npm install
```

Run checks:

```powershell
npm run check
npm test
npm run build
```

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the generated `dist` folder.
5. Open a YouTube video page and scroll to the comments.
6. Open the extension popup to check scanned and hidden counts.

After changing source code, rebuild and reload the extension:

```powershell
npm run build
```

## Project Structure

```text
src/
  content/
    content.ts
    spamDetector.ts
    youtubeComments.ts
  popup/
    popup.css
    popup.ts
  shared/
    settings.ts
    types.ts
public/
  manifest.json
popup.html
```

## Limitations

- The extension only hides comments in your browser.
- It does not delete, report, or modify YouTube comments.
- It does not use machine learning or an external moderation API.
- YouTube DOM changes may require selector updates.
- Rule-based filtering can still produce false positives or false negatives.
