# YouTube Spam Comment Filter

Chrome extension MVP that hides likely spam comments on YouTube video pages.

## What It Does

- Runs on `https://www.youtube.com/watch*`
- Detects YouTube comment nodes as they load
- Hides comments that match simple spam heuristics
- Lets you turn filtering on or off from the extension popup
- Lets you reveal hidden comments in a faded debug view

## Local Setup

Install dependencies inside this project folder:

```powershell
npm install
```

Build the unpacked extension:

```powershell
npm run build
```

Then load `dist` in Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select this project's `dist` folder

## Checks

```powershell
npm run check
npm test
npm run build
```

## MVP Limits

- This version only hides comments in your browser.
- It does not delete, report, or modify YouTube comments.
- It uses local rules, not an AI model or external server.
- Rule-based filtering can produce false positives, so use the popup's reveal option when tuning.
