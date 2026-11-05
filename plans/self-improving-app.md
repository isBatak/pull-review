# Self-improving app

Let any Pull Review user point at a part of the app, ask for a change in plain words, and have their local Claude Code make it. The change shows up after a reload, can be sent upstream as a PR, survives app updates, and stacks with other changes.

This file is the single plan for the whole feature. Update the todo list and the notes under each step as work lands.

## Todo

- [x] 1. Spike: prove the window can load a `file://` page from an overlay folder and the backend can import an overlay `main.js`.
- [x] 2. Release build: ship unminified bundles with source maps that carry `sourcesContent`, and check the size cost.
- [x] 3. Copy the sourcery transform into the repo and run it in release builds so every element carries its source location.
- [x] 4. Overlay store: create `overlay/<version>/` as a git repo with `build/` and `source/`, and load it at start.
- [x] 5. Boot check and fallback: run a ready handshake, fall back to the shipped build on failure, and support ⌥ at launch.
- [x] 6. Picker: add the header crosshair, pick mode with ⌥ measure, and the floating composer with the Context popover.
- [x] 7. Feedback page: add `/feedback` with the request box and the Agent's turn, Needs you and Done lists.
- [x] 8. Agent runner: queue requests, run `claude` in the overlay, stream progress to the card, and commit each change.
- [x] 9. Reload toast: show "A new version of the app is ready" with Reload, or Restart for backend changes.
- [x] 10. Change actions: add View diff, Reply, Undo, Retry and Dismiss on each card.
- [x] 11. Send as PR: fork with `gh`, push the source diff, open the PR, and fall back to a prefilled issue.
- [x] 12. Update replay: build a new overlay on update, drop merged changes, and replay or redo the rest with Claude.
- [x] 13. CLI: give the CLI its own overlay and the same Feedback flow.
- [x] 14. Docs, tests and release: update the README, add tests for the pure parts, and ship behind a beta label.

## Reference app

The screenshots come from another app ("Feedback" page in a personal dashboard). What it does:

1. **Feedback page** in the left nav. A large request box at the top, then lists by state. The header shows the total ("35 notes").
2. **Done list.** Each row has a green check, the request text cut to one line, a commit chip with a branch icon and short hash (`37398b1`), and a date. A row without a commit shows "Done" instead of a hash. "Show 25 more" pages the list.
3. **Pick mode.** A crosshair button at the bottom of the nav starts it. A bar at the bottom says "Tap what this note is about · Hold ⌥ to measure · Cancel". Hovering outlines the element in purple, the cursor turns into a crosshair.
4. **Composer.** After a pick, a floating box opens at the bottom with the request text and a send button. Below it: a chip "Pointed at "Feedback"" with a remove button, and "Context · 5 details".
5. **Agent's turn card.** Shows the request, then a meta line: page name, time, viewport (`desktop 1322 px`), theme (`light`), app name, and a Context link. A status row ("Queued · waiting for the agent to start"), then a reply box with Mark done and Dismiss.
6. **Working state.** The status turns into a yellow half circle and "Agent working · 3 min · View run".
7. **Ship toast.** "A new admin just shipped. Reload to get it." with a Reload button.

## Decisions

| Topic | Decision |
|---|---|
| Who can use it | Every app user, not just people with a clone of the repo. |
| What Claude edits | The shipped build, not a source checkout. Release builds become readable (no minify) and ship source maps with the original source inside. |
| Where edits live | A versioned overlay folder outside the `.app`. The bundle stays signed and untouched. |
| How changes are recorded | The overlay is a git repo. Commit 1 is the shipped build, each change is one commit on top. |
| Source for PRs | The overlay has a `source/` tree written from the source maps. Claude edits `source/` and `build/` in the same commit. |
| Agent rights | The user's full Claude Code rights. |
| Queue | One request at a time. Each one runs on top of the last commit, so the stack stays linear. |
| Context | Picked element, page, viewport, theme, version and a window screenshot. |
| Element to source | Copy sourcery's transform and picker code into this repo. |
| Placement | Two header buttons (pick, feedback) on every page, plus a `/feedback` route. |
| Safety | Syntax check before the toast, ready handshake after reload, automatic fallback to the shipped build. |
| PRs | Opt-in "Send as PR" through `gh`. Own PR on `main` when the change applies alone, otherwise stacked with "Depends on #N". |
| Updates | Claude replays open changes onto the new version. Merged ones are dropped. |
| CLI | Separate overlay and change list from the app. |

## Design

### Folders

App overlay root: `~/Library/Application Support/dev.pull-review.app/overlay/` (the tinyjs data folder for the app id, see step 1).
CLI overlay root: `~/Library/Application Support/dev.pull-review.app/cli-overlay/` on macOS, `$XDG_DATA_HOME/pull-review/cli-overlay/` elsewhere.

```
overlay/
  0.2.18/                 one per app version
    .git/
    build/
      app-web/            copy of Resources/app/frontend
      app-backend/        copy of the backend main.js
    source/
      src/...             written from sourcesContent, src/ only
      package.json
  changes.json            the change list for every version, see below
  attachments/<id>/       screenshot.png per change
  boot-failure.json       why the last start fell back (step 5)
  active                  text file with the version folder in use, or "off"
```

`changes.json` holds an ordered list:

```ts
interface LocalChange {
  id: string
  request: string
  context: ChangeContext
  status: 'queued' | 'working' | 'ready' | 'applied' | 'needs-you' | 'broke-app' | 'undone' | 'dismissed'
  commits: string[]
  claudeSessionId: string
  dependsOn: string[]
  pr?: { number: number, url: string, branch: string, state: 'open' | 'merged' | 'closed' }
  createdAt: string
  finishedAt?: string
  durationMs?: number
  error?: string
}
```

### Step 1. Spike: loading an overlay

Prove both halves before anything else, because the rest depends on them.

- **Web.** Add `"readAccess"` to `tinyjs.json`, set to the overlay root (not the whole home folder). From `init(app)` in `src/tiny/main.ts`, if `active` names a version that matches `__APP_VERSION__`, call `app.eval("location.replace('file://…/build/app-web/index.html')")`. `onNavigate` already allows `file:` pages.
- **Check CSP.** `build/content-security-policy.ts` limits scripts to the page's own files. Make sure the overlay page still runs and that the hash list (if any) is redone or relaxed for the overlay copy.
- **Backend.** Make the shipped `main.js` a thin loader: at start it checks for `build/app-backend/main.js` in the active overlay and re-exports its `api`, `init` and `onNavigate` with a dynamic `import()`. Prove txiki.js can import an absolute `file://` path. If it can't, read the file and evaluate it as a module from a blob or data URL.
- **Bridge allow list.** The overlay page has a `file://` origin, so the `"api"` origins in `tinyjs.json` already cover it. Confirm.
- **Output:** a short note here saying what worked, with any tinyjs limits found.

**Result (2026-11-01, tinyjs 0.50.1), tested with a throwaway packaged app:**

- The generated `entry.js` does `import * as appMod from './src/main.js'` and reads `api`, `init`, `onNavigate` and the other hooks once, after the import finishes. So `main.ts` can `await import()` an overlay backend at top level and re-export its handlers.
- txiki.js `import()` loads a plain absolute path (`/Users/…/main.js`). A `file://` URL fails. Query strings for cache busting are not supported, so a changed backend needs a restart.
- From `init(app)`, `app.eval("location.replace('file:///…/index.html')")` moves the window to a page outside the bundle. Relative scripts load, and the `tiny` bridge works there. `onNavigate` is not asked for `file:` moves.
- Without `"readAccess"` the overlay page is blocked. `"readAccess": "~/…"` works, the launcher expands `~`. So the overlay root must be a fixed path under home. Use tinyjs's own data folder: `~/Library/Application Support/dev.pull-review.app/overlay`.
- The production CSP already allows `file:` scripts and styles, so the overlay page runs as is.

### Step 2. Readable release build

- In `vite.config.ts`, for the app build: `build.minify: false`, `build.sourcemap: true`. Keep hashed file names.
- In `tsdown.config.ts`, same for `app-backend` and `cli`: no minify, source maps on.
- Make sure maps keep `sourcesContent` and that `sources` paths are relative to the repo root (`src/web/...`), so they can be written back as a tree.
- Measure the zip size before and after, and write the numbers here. Shiki grammars are already large and unminified JSON, so the growth should be modest.
- Panda: the built CSS is atomic. Note in the agent prompt that a new style token used in `source/` needs a matching rule added by hand to the built CSS in `build/`.

**Result (2026-11-01):**

- `vite.config.ts` sets `minify: false` and `sourcemap: true`. `tsdown.config.ts` sets `sourcemap: true` (tsdown never minified).
- `build/own-source-maps.ts` runs after each bundle is written, for Vite and tsdown. It rewrites `sources` to repo paths (`src/web/main.tsx`), keeps `sourcesContent` only for `src/` files, and deletes maps (and their `sourceMappingURL` line) for chunks with no own code, like the Shiki grammars. The logic is in `src/shared/source-maps.ts` with tests, and `ownSources()` there is ready for step 4.
- Dependency source text was 16 MB of the maps, own source only 1.15 MB.
- Sizes for `out/app-web` + `out/app-backend`, zipped: 3.78 MB before, 5.05 MB after (+1.27 MB). Without the trim it was 8.29 MB.
- What's left in the maps: web 126 own files, app backend 48, CLI 49.
- tsdown loads its config through Node's type stripping, which needs file extensions. `tsconfig.json` now has `allowImportingTsExtensions`, and the two build-time imports use `.ts`.

### Step 3. Element to source with sourcery code

Copy from `isBatak/isbatak-labs/packages/tools/sourcery` into `build/sourcery/` (transform) and `src/web/feedback/` (picker, step 6):

- `core/transform.ts` (oxc-parser plus magic-string) as a Vite plugin in `build/`, turned on for production too. Attribute `data-sourcery="src/web/components/sidebar.tsx:42:5"`, relative to the repo root (not Vite's `root: src/web`).
- `core/panda.ts` so `styled()` and slot recipe contexts get `data-sourcery-styled`.
- The overlay drawing code from `client/index.ts`, reworked into `pickElement(): Promise<PickResult | null>` started from a button, not from hotkeys, and with no editor server.
- Add `oxc-parser` and `magic-string` as dev dependencies. Keep the MIT notice and credit in a `LICENSE` file next to the copied code.

**Result (2026-11-01):**

- `build/sourcery/transform.ts` is sourcery's `core/transform.ts` without the Panda part. This repo styles with `css()` only and never imports Panda's `styled` or `jsx` entry, so `data-sourcery-styled` would never be set. ⌥ in pick mode therefore only measures.
- `build/sourcery/vite.ts` runs the transform in dev and build, for `.tsx`/`.jsx` outside `node_modules`. Paths are relative to the repo root, not Vite's `src/web` root.
- Tests in `build/sourcery/transform.test.ts`. `vitest.config.ts` now also picks up `build/**/*.test.ts`.
- `build/sourcery/LICENSE` keeps the MIT notice and says where the code came from.
- A production build tags 2,142 places. The source maps still hold the original, untagged source, so `source/` stays clean.
- Checked in a headless browser with the CLI build: the home page renders, 28 tagged elements, no console errors.
- The picker overlay from `client/index.ts` moves to step 6, where it's used.

### Step 4. Overlay store

Backend module `src/server/self-improve/overlay.ts`, shared by app and CLI through the existing host interface (`src/tiny/local-host.ts` and `src/server/local/node-host.ts`):

- `ensureOverlay(version)`: if missing, copy the shipped build into `build/`, write `source/` from every `.map` file's `sourcesContent` (skip `node_modules` and virtual modules), `git init`, commit "Shipped build <version>", tag it `shipped`.
- `activeOverlay()` and `setActive(version | 'off')`.
- `commitChange(change)`: `git add -A && git commit` with the request as the message, store the hash on the change.
- `undoChange(id)`: `git revert` its commits. If the revert conflicts, mark "Needs you" and let Claude resolve it as a new queued job.
- `reset()`: `git reset --hard shipped`, all changes marked undone.
- Needs `git` on the Mac. If it's missing, the Feedback page explains how to install the Command Line Tools.

**Result (2026-11-01):**

- `src/server/self-improve/overlay.ts` (`createOverlayStore`) with tests in `overlay.test.ts`, run against real git. It takes `{ root, version, parts }`, where each part is a shipped folder copied to `build/<name>`.
- `ensure()` builds everything in `<version>.partial` (copy, `git init`, `source/` from the maps with `ownSources()`, first commit, tag `shipped`) and moves it into place only at the end. A half-made overlay never looks finished.
- `changes.json` and `attachments/` are in `.git/info/exclude`, so they never land in a change's commit.
- Also: `isActive()`, `setActive()`, `changedFiles()`, `commit()` (returns `null` when nothing changed), `revert()` (newest first, aborts cleanly on conflict), `discard()` (drop work in progress) and `reset()` (back to `shipped`).
- The backend entry is now a loader. `src/tiny/app.ts` is the old `main.ts`. `src/tiny/main.ts` checks `active` (only inside a packaged `.app`, so `tinyjs dev` never uses an overlay), sets `globalThis.__pullReviewOverlay`, and imports either the overlay's `build/app-backend/main.js` or `./app`. The overlay's own copy of the loader sees the flag and loads its own app.
- Swapping the page in `init()` did not work: the first page has not loaded yet and the `eval` is lost. The loader instead wraps `onNavigate` and, on the main page's `finish` event for a `file:` URL outside the overlay, runs `location.replace` to the overlay page. This also catches a reload that lands on the shipped page. The shipped page shows briefly first, step 5 can hide that.
- `tinyjs.json` has `"readAccess": "~/Library/Application Support/dev.pull-review.app/overlay"`. A test keeps it in sync with `APP_OVERLAY_ROOT` in `src/shared/self-improve.ts`.
- End to end with a packaged build: made a real overlay with the store (159 source files), marked its backend and page, launched the app. The overlay backend answered requests and the overlay page loaded and called the bridge. Without an overlay the app starts as before.
- Not done here: telling the user when `git` is missing. That belongs to the Feedback page (step 7).

### Step 5. Boot check and fallback

- Before the toast: run `node --check` (or the txiki equivalent) on every changed `.js` in `build/`. Fail means status `needs-you` with the error, and Claude gets one automatic retry.
- After reload, the overlay page calls a `ready` bridge call once React has mounted. The backend starts a 10 second timer when it swaps the page. No `ready` in time, or an error from the overlay backend import, means: load the shipped page, set `active` to `off`, mark the newest applied change `broke-app`.
- On the next page load, show a banner: "Your last change broke the app. Undo it, or ask Claude to fix it."
- Holding ⌥ while the app opens skips the overlay. Settings, General gets "Use local changes" (on by default) and "Open overlay folder".

**Result (2026-11-01):**

- `createOverlayBoot()` in `src/shared/self-improve.ts`, with tests, holds the page logic. When the shipped page finishes loading, it moves the window to the overlay page and starts a 10 second timer. Only a `bootReady` call from a page under the overlay URL stops it, so the shipped page can't report in by mistake. A timeout, or a `fail` or `crash` event for the overlay page, sends the window back to the shipped page.
- The page calls `bootReady` with `location.href` once React has mounted (`BootReady` in `src/web/main.tsx`). `bootReady` is a new bridge call, added to both origin lists in `tinyjs.json`. A test checks both lists.
- On failure the loader writes `active` = `off` and `overlay/boot-failure.json` (`{ version, reason, at }`) for the Feedback page to show.
- **txiki.js crashes (exit 139) when an imported module throws while loading, even inside `try`.** So a broken overlay backend can't be caught in-process. The loader writes `overlay/booting` before the import and deletes it after. If a start finds the marker, the last start crashed: it turns the overlay off, records why, and loads the shipped backend. The user sees one crash, then the app works.
- ⌥ at launch: the loader reads `NSEvent.modifierFlags` through `osascript -l JavaScript` (about 0.1 s, only when an overlay is active) and skips the overlay for that start, without turning it off.
- End to end with a packaged build: a good overlay stays on; a page with a syntax error falls back after 10 seconds and the shipped page loads again (checked with probes); a backend that throws crashes once, then the next start falls back.
- Moved to later steps: the syntax check before the toast, plus a backend check in a separate `tjs` process (step 8, since in-process loading can't be made safe). The "your last change broke the app" banner, plus the "Use local changes" and "Open overlay folder" settings (step 7, which adds the API). Hiding the short flash of the shipped page before the swap is not done.

### Step 6. Picker and composer

- Header buttons in `src/web/components/app-header.tsx` (and the review page header): `Crosshair` starts pick mode, `MessageSquare` opens `/feedback`. Shown only when `claude` is available (reuse `available()` from `src/server/chat/service.ts`).
- Pick mode bar at the bottom: "Click what this request is about · Hold ⌥ to measure · Cancel". Esc cancels.
- Hover outlines the element under the pointer with a `data-sourcery` attribute. ⌥ shows the element's size and the gaps to its neighbours and parent, and switches to the `styled()` location when there is one.
- Click opens the composer floating at the bottom of the current page: textarea, send button, a chip "Pointed at "<label>"" with remove, and "Context · N details".
- Context collected (each item can be removed in the popover):
  - route and page title
  - window width and height, theme, zoom
  - app version and overlay commit
  - element: sourcery location, styled location, CSS path, text (200 chars), outer HTML (2 KB), key computed styles (margin, padding, gap, font, colors)
  - a PNG of the window, from `app.captureScreen` cropped to the window, or `html-to-image` if that's not allowed. Add the needed call to the `"api"` allow list only if it's really needed.
- The composer also works without a pick: the request box on `/feedback` sends with page context only.

**Result (2026-11-01):**

- `src/web/feedback/picker.ts`: sourcery's overlay drawing, started by `startPicker({ onPick, onCancel })` instead of hotkeys and without the editor server. It outlines the closest `data-sourcery` element and labels it `tag  file:line:column`. With ⌥ it shades margin and padding and shows `W × H  padding …  margin …  gap …`. It blocks the page's clicks, and Esc cancels. Our own UI carries `data-self-improve-ui` and is never picked or blocked.
- `src/web/feedback/context.ts` builds the `FeedbackContext`: app version, page route and title, window size, theme, the element (label, sourcery location, CSS path, text, 2 KB of HTML, key computed styles, box) and a screenshot. The shared types and the pure helpers (`elementLabel`, `trimHtml`, `contextDetails`, `withoutDetails`…) are in `src/shared/self-improve.ts` with tests. Each removable detail is `null` when left out.
- `src/web/feedback/screenshot.ts` uses `html-to-image` (`toPng` of the body at window size, our UI filtered out, fonts and remote images skipped because of the CSP, 8 s limit). No macOS screen-recording permission is needed, and it works in the CLI too. It runs after the pick, so the composer opens at once and the picture fills in later.
- `src/web/feedback/self-improve.tsx`: `SelfImproveProvider` (mounted inside the router in `main.tsx`) with the pick bar, the composer ("Pointed at" chip, Context popover where each detail can be removed or added back, ⌘↵ to send) and a short "Sent to Claude · See progress" notice. `SelfImproveButtons` (crosshair, and a speech bubble linking to `/feedback`) sit in the start page, review and Releases headers. They only show when `claude` is installed (`useChatAvailable`).
- Sending calls `api.createFeedback()`, `POST /api/self-improve/changes`. Step 7 adds that route, until then it shows "Request failed with 404".
- Found while testing: React passes events from portals to their React parents, so Esc in the Context popover also closed the composer. The composer now handles only Esc that starts inside its own box.
- Checked in a headless browser with the CLI build: pick bar, outline label, ⌥ measure label, chip, all five details, screenshot preview, and the expected 404 on send. Not yet checked inside the packaged app.

### Step 7. Feedback page

New route `/feedback` in `src/web/main.tsx`, page `src/web/pages/feedback-page.tsx`.

- Request box at the top.
- Sections: **Agent's turn** (queued and working), **Needs you** (needs-you and broke-app), **Done** (ready, applied, undone), each with a count. "Show 25 more" for long lists.
- Done row: status icon, request on one line, commit chip with short hash (click opens View diff), PR chip when there is one, date.
- Card for open items: request, meta line (page · time · viewport · theme · Context), status row, reply box with Mark done and Dismiss.
- A banner when `overlay/boot-failure.json` exists: "Your last change broke the app", with Undo and Ask Claude to fix it. Settings, General gets "Use local changes" and "Open overlay folder" (moved here from step 5).
- Data from new API routes in `src/server/api.ts`: `GET /api/self-improve/changes`, `POST /api/self-improve/changes`, `POST /api/self-improve/changes/:id/reply`, `/undo`, `/dismiss`, `/retry`, `/pr`, and `GET /api/self-improve/changes/:id/diff`. Poll every 2 seconds while anything is working, like the Claude review panel does.

**Result (2026-11-01):**

- `changes.json` and `attachments/` moved from the version folder to the overlay root, because step 12 carries changes from one version to the next. Each change keeps the `version` it was made on. `LocalChange` (in `src/shared/self-improve.ts`) also gained `hasScreenshot` and `startedAt`. The screenshot is stored as `attachments/<id>/screenshot.png`, not inside `changes.json`, so Claude can open it in step 8. `LocalHost` got `writeBinary` for that.
- `src/server/self-improve/service.ts` (`createSelfImproveService`, tests in `service.test.ts`): `state()`, `create()`, `dismiss()`, `setActive()`, `clearBootFailure()`, `openFolder()`, plus `updateChanges()`, which runs one write at a time, for the runner in step 8.
- Routes in `src/server/self-improve/routes.ts`, registered on the API: `GET /self-improve/state`, `POST /self-improve/changes`, `POST /self-improve/changes/:id/dismiss`, `POST /self-improve/active`, `POST /self-improve/boot-failure/dismiss`, `POST /self-improve/open-folder`. Without a service they answer 404 "Local changes are not available here." Diff, undo, reply, retry and PR routes come with steps 10 and 11. There is no screenshot route yet, since no page shows the picture.
- The app creates the service only inside a packaged `.app` (`packagedAppDir()`), copying `Resources/app/frontend` and `Resources/app/src`. The CLI service was wired early, so the page can be tested in a browser: root `~/Library/Application Support/dev.pull-review.app/cli-overlay` (or `$XDG_DATA_HOME/pull-review/cli-overlay`), parts `web/`, `cli.mjs` and `cli.mjs.map`. Loading the CLI overlay at start is still step 13.
- `src/web/pages/feedback-page.tsx` at `/feedback`: header with count and the pick button, the failed-start banner ("Got it" clears it), the request box (⌘↵), Agent's turn and Needs you cards (request, page · time · desktop/mobile width · theme · Context popover, status row, Dismiss), Done rows (check, request, short commit hash, date, "Show 25 more"), and an empty state. `useSelfImproveState()` polls every 2 s while anything is queued or working.
- The header buttons now show only when `claude` is installed and the state route answers, so the CLI and dev builds hide them where local changes can't work.
- Settings, General: "Local changes" with "Use local changes" and "Open folder" (`src/web/components/settings/local-changes-setting.tsx`).
- Checked in a headless browser with the CLI build: banner, empty state, a request from the box and one from the composer (with its PNG on disk), Dismiss, "Got it", the Context popover. No console errors. Not yet checked inside the packaged app. "Mark done" and "Leave a reply" from the reference are step 10.

### Step 8. Agent runner

`src/server/self-improve/runner.ts`, built on the same pieces as `src/server/chat/service.ts` (`findExecutable` for `claude`, `claudeEnv()` without `ANTHROPIC_API_KEY`, `applyStreamLine` for stream-json).

- One job at a time from the queue. Each job:
  1. `cwd` is the overlay version folder.
  2. Run `claude -p --output-format stream-json --verbose --session-id <id>` with the user's own permission settings. The prompt comes from a file, like the chat does.
  3. Prompt template (in `src/shared/self-improve-prompt.ts`, unit tested): the request, the context block, the screenshot path, the layout of `build/` and `source/`, the rule "change `source/` and `build/` to match", the Panda CSS note, "don't touch `.git` or `changes.json`", and "reply with a one line summary".
  4. Stream steps to the card (reuse `thinking-timeline.tsx`). "View run" opens a panel with the full log.
  5. On exit 0 with file changes: boot check, commit, status `ready`, push the toast event. No changes: status `needs-you` with Claude's answer as a question for the user.
  6. Boot check before the toast (see step 5): parse every changed `.js` in `build/`, and for backend changes import the overlay's `build/app-backend/main.js` in a separate `tjs run` process with `globalThis.__pullReviewOverlay` set, so a module that throws never reaches the app's own start.
- Reply on a card: resume the same session (`--resume <id>`) as a new queued job, new commit on the same change.
- Cancel a working job: kill the process, `git checkout -- . && git clean -fd` in the overlay.

**Result (2026-11-04):**

- `src/server/self-improve/runner.ts` (`createChangeRunner`), created inside the service. One request at a time, oldest first, only for the running version (older ones wait for step 12). A request that arrives while the loop is ending still gets picked up.
- Each run: mark `working` with `startedAt` and a new `sessionId`, `overlay.ensure()`, drop leftover edits, write the prompt to `attachments/<id>/prompt.txt`, then `claude -p --output-format stream-json --verbose --include-partial-messages --permission-mode acceptEdits --append-system-prompt … --session-id … --add-dir attachments/<id>` in the overlay folder. The user's own Claude Code settings apply (full rights, as decided), and `acceptEdits` lets file edits through without a prompt. Runs stop after 30 minutes.
- Prompts are in `src/shared/self-improve-prompt.ts` with tests. The system prompt explains `build/` and `source/` for the parts that shipped, `data-sourcery`, the Panda CSS rule, and the rules (edit both, no builds or commits, reply in one or two plain sentences, or ask one question and change nothing). The request prompt adds the page, window, theme, the picked element (source line, label, CSS path, size, text, computed styles, HTML) and the screenshot path.
- After Claude finishes: no changed files means `needs-you`, with Claude's reply shown as a question. Otherwise each changed `build/**/*.js|mjs` gets a syntax check through the new `LocalHost.checkModuleSyntax` (`tjs compile <file> /dev/null` in the app; `node --check` on a `.mjs` copy in the CLI, since Node reads `.js` as CommonJS). A changed `build/app-backend/` file also gets a test load in a separate `tjs run` process (`probeBackend` in `src/tiny/app.ts`). Any problem drops the edits and sets `needs-you` with the reason. Otherwise: commit (title = first line of the request, body ends with `Request: <id>`), turn local changes on, and set `ready` with the summary and the commit hash.
- The app starts the runner from `init()`, which only the real app calls, so the backend test load never picks up queued requests. The CLI calls `start()` before it listens. `start()` puts requests left `working` by a quit back in the queue.
- Dismiss on a working request stops Claude, drops its edits and marks it `dismissed`. The card's button says Stop while it works. Live steps are kept in memory (`state.run`), not in `changes.json`, and the card shows them with the chat's `ThinkingTimeline` and `stepsFromTools`. A `needs-you` card shows Claude's question with a question icon, or the error.
- `findClaude()` and `claudeEnv()` moved to `src/server/local/claude.ts` and are shared with the chat service.
- Tests in `runner.test.ts` use a fake `claude` script: a committed change with the right arguments, a syntax error, a question, a crash, `claude` missing, Stop, and picking up after a quit. Found while testing: the service tests were starting the real `claude`, since `create()` now kicks the runner. They now pass `claudePath: null`.
- End to end with the real `claude` through the CLI build: "Change the heading Pick a GitLab project to Choose a GitLab project" was done and committed. Claude changed both `build/web/assets/index-*.js` and `source/src/web/pages/home-page.tsx`, and its summary was plain. The working card with live steps has not been seen in a browser yet. Claude does not get one automatic retry after a failed check; the Retry button in step 10 covers it.

### Step 9. Reload toast

- Bottom right toast: "A new version of the app is ready. Reload to get it." with Reload.
- Web-only change: Reload swaps the page to the overlay (or reloads it) and keeps the current route.
- Backend change (anything under `build/app-backend/`): the button says Restart and quits and relaunches the app, since the backend can't be swapped in place.
- After the ready handshake, status becomes `applied`.

**Result (2026-11-04):**

- When to reload or restart: `reloadKind()` in `src/shared/self-improve.ts` (tested). No `ready` change means no toast. A restart is needed when a ready change touched the backend (`touchesBackend`, set by the runner for any changed `build/` file outside `app-web/` or `web/`), or when the running backend isn't the overlay. The second case covers the first local change, since the desktop app loads its backend only at start. Otherwise reloading the page is enough. Where the app can't restart itself (the CLI until step 13), the toast says to restart in the terminal. The service gets the running build from a `running()` option and puts `reload` in the state.
- `ReloadToast` in `src/web/feedback/self-improve.tsx`, bottom right: "A new version of the app is ready" with Reload, Restart or the terminal hint, and Later. Later hides it until another change becomes ready.
- Restart: a new `restartApp` bridge call in the loader (added to both origin lists, with a test). tinyjs has no relaunch, so it runs `sleep 1; open -n <bundle>` in the background and quits.
- Applied and broken: the loader passes events to the app's own API through `app.api.request`. An accepted `bootReady` posts `/self-improve/applied`, which marks this version's `ready` changes `applied`. A boot failure, or a crash found at start, posts `/self-improve/broken` with the reason, which marks the newest `ready` change (or else the newest `applied` one) `broke-app`.
- The boot watcher now also checks a reload of the changed page: a `start` event for the overlay page re-arms the 10 second timer.
- Found while testing: tsdown never cleaned `out/app-backend`, so every build left its old hashed chunk there and the app shipped all of them. That folder is now cleaned on each build. The loader and the app now share a small `self-improve-*.js` chunk.
- Checked end to end. In the CLI with a fake `claude` first on `PATH`: working card with Stop, then Done with the commit hash, then the toast with the terminal hint, then Later. In a packaged app: a ready change becomes `applied` after a good start; a broken page marks it `broke-app` ("did not start within 10 seconds") and turns local changes off; a backend that throws crashes once, then the next start marks the change `broke-app`. Not checked: clicking Reload or Restart in the app window, since the window can't be driven from a script.

### Step 10. Change actions

- **View diff**: the `source/` diff of the change, shown with the app's own diff view (`@pierre/diffs`). A tab shows the `build/` diff.
- **Undo**: revert, then the reload toast.
- **Retry** for needs-you and broke-app: queue the same request again with the error added.
- **Dismiss**: drop a queued or failed change without touching the code.

**Result (2026-11-04):**

- New change fields: `needsReload`, `replies` (`{ text, at }`) and `followUp`. Entries saved before these existed get defaults when read (`NEW_CHANGE_FIELDS`). The reload toast now depends on `needsReload`, not on status `ready`, so an undo asks for a reload too. A start of the changed page clears it.
- **Reply** (`POST /self-improve/changes/:id/reply`): for done, question, failed and broken changes of this version. It queues the change again with the reply as `followUp`. The runner resumes the same Claude session (`--resume <sessionId>`) with `buildFollowUpPrompt()`, which tells Claude to look at the files again, and adds a new commit to the same change. A follow-up with no session to resume gets the full prompt plus the reply.
- **Retry** (`/retry`): only for `needs-you`, in a fresh session.
- **Undo** (`/undo`): `git revert` of all the change's commits, newest first. It refuses while Claude is working, and says "A later change builds on this one. Undo the later change first." when the revert conflicts. Undoing a `broke-app` change turns local changes back on and clears the boot failure.
- **View diff** (`GET /diff`): `git show` of each commit, limited to `source/` and `build/`, split with `splitPatchByFile`. Shown with `PatchFileCard`: source files first, built files behind "Show the built files (N)", and anything over 100,000 characters replaced by a note. A change with no source edits says it can't become a pull request yet.
- UI (`src/web/feedback/change-actions.tsx`, `src/web/pages/feedback-page.tsx`): question and failed cards get a reply box, failed ones also "Try again". Broken ones get "Ask Claude to fix it" (a reply with the error filled in) and Undo. Done rows open into Claude's summary, the reply thread, a follow-up box, View diff and Undo. Errors from these actions show under the card. A question card shows a question icon, not a warning.
- Changes made on another version answer 409 for these actions until step 12 moves them over.
- Tests: reply resumes the session and adds a commit, retry gets a new session, undo with and without a later change, the diff split, applied marking based on `needsReload`. Checked in a headless browser with the CLI and a fake `claude`: expand, View diff, reply (second commit), a question card, Undo of both commits, then the reload toast. "Mark done" from the reference isn't added, since Dismiss covers it.

### Step 11. Send as PR

Opt-in button on a done change, plus "Send all as PRs".

1. Check `gh auth status`. If `gh` is missing or logged out, offer "Copy patch" and "Open issue": a new issue on `isBatak/pull-review` prefilled with the request, context (without the screenshot) and the source diff.
2. `gh repo fork isBatak/pull-review --clone=false` once, remember the fork.
3. Work in a temp clone in `~/Library/Caches/pull-review/pr-work`, shallow from `main`.
4. Turn the change's commits into a source patch: `git format-patch` limited to `source/`, with the `source/` prefix stripped.
5. `git apply --3way` on `main`. If it applies, branch `self-improve/<id>` from `main`. If not, branch from the PR branch of the change it depends on (from `dependsOn`, or found by trying the earlier changes in order) and note "Depends on #N" in the body. If it applies to neither, queue a Claude job to rebase it in the temp clone.
6. Add a version bump and `CHANGELOG.md` entry? No: leave that to the maintainer, since many PRs would clash on the version line.
7. Push to the fork and `gh pr create` with title = first line of the request, body = full request, context, before screenshot, "Made with Pull Review's self-improve feature on <version>".
8. Save the PR on the change. Refresh its state when the Feedback page opens.

**Result (2026-11-04):**

- `src/server/self-improve/pull-request.ts` (`createPullRequests`), text builders in `src/shared/self-improve-pr.ts` (branch `self-improve/<first 8 of id>`, title from the first line, body with request, Claude's summary, an optional note and the version; never the screenshot). The repository is `SELF_IMPROVE_REPO` (`isBatak/pull-review`).
- Send: `gh auth status`, then `gh api user` for the login. Unless the login owns the repository, `gh repo fork --clone=false --remote=false`; the owner pushes straight to the repository. The work clone lives in `<cacheDir>/self-improve/repo` (a full clone, then `fetch --tags` each time). Git calls use `gh auth git-credential` as the credential helper, so pushing needs nothing beyond `gh auth login`.
- Patches: `overlay.sourcePatch()` is `git show --relative=source --full-index --binary` per commit, so paths are `src/...`. Since `source/` is rebuilt byte-for-byte from the maps, its blob hashes match the files of the commit that was built (checked: the rebuilt `home-page.tsx` had the same hash as the repository's), and `git apply --3way` can merge onto newer code.
- Bases, in order: `origin/main`. Then the branch of each earlier change of this version with an open PR, newest first, fetched from the fork, with the note "Depends on #N, which this change builds on." Then the tag `v<version>`, with "Made on version X. It did not apply to main as it is, so it may need a rebase." If none works: "Send the earlier changes it builds on first." GitHub can't base a PR on a fork branch, so a dependent PR targets `main` and also shows the earlier commit until that PR merges.
- Then commit, `push --force` to the branch, and `gh pr create --base main --head <login>:<branch> --body-file`. Sending again after a reply pushes the new commits to the same branch, and the open PR updates.
- Routes: `POST /changes/:id/pr` (a failure answers 409 with `code`: `gh-missing`, `gh-signed-out`, `no-source`, `does-not-apply` or `failed`), `GET /changes/:id/patch` (`{ patch, issueUrl }`), `POST /prs/refresh` (`gh pr view --json state` for open PRs, called once when the Feedback page opens).
- UI: an open Done row has "Send as PR" (or "Update PR", with "Sending…" while it runs), a `#N open|merged|closed` chip that opens GitHub, and on `gh-missing`, `gh-signed-out` or `does-not-apply` the buttons "Copy patch" and "Open an issue" (a prefilled GitHub issue with the patch, cut at 5,000 characters).
- Version bump and changelog are left to the maintainer, as planned.
- Tests (`pull-request.test.ts`) use local bare repositories for upstream and fork and a fake `gh` that logs its calls and the PR body: fork, push and PR on `main`; the owner pushes without a fork; the tag fallback with its note; "Depends on #7" for a change on top of an earlier PR; no `gh` with the patch and issue link still working; PR state refresh. Checked in a headless browser with a signed-out fake `gh`: the error and both fallbacks show. **No real fork, push or PR was made.** The first real send should be watched.

### Step 12. Update replay

Runs when the app starts on a new version and an older overlay has changes in `applied` state.

1. `ensureOverlay(newVersion)`. Keep the old one until replay is done. The app runs the shipped build meanwhile.
2. Drop changes whose PR is merged and contained in the new tag (`gh api repos/isBatak/pull-review/compare/<merge sha>...v<new>`, or check the release notes for the PR number when `gh` is missing).
3. For each remaining change in order:
   - Try `git apply --3way` of its `build/` and `source/` diff from the old overlay.
   - If that fails, queue a Claude job: "Redo this change on the new version", with the request, the old source diff and the context.
   - If Claude can't, status `needs-you` with Retry and Drop.
4. When the queue is empty, set `active` to the new version and show the reload toast. Old overlays are deleted after 30 days.
5. The Feedback page shows a banner while replay runs: "Moving 3 local changes to 0.2.19".

**Result (2026-11-05):**

- Applying the old commit's `build/` diff almost never works, because built files get new hashed names each release (`index-ABC.js` becomes `index-XYZ.js`). Only the `source/` part carries over. So a moved change is a replay request: the source patch is applied mechanically, and Claude redoes the build part.
- `moveChanges()` in the service runs from `start()` before the queue, for changes whose `version` differs and that aren't `undone`, `dismissed` or `landed`:
  - `ready` or `applied`: if the PR is merged and `landedIn()` finds its merge commit inside tag `v<new version>` (`gh pr view --json mergeCommit`, then `git merge-base --is-ancestor` in the PR work clone), the change becomes the new status `landed` ("In the app"). Otherwise its source patch from the old overlay is saved as `attachments/<id>/replay-<old>.patch`, and it becomes `queued` on the new version with `replay: { fromVersion, patchFile }`, no commits and no session.
  - `queued`, `working` and `needs-you` move to the new version as they are, with a fresh session, since a Claude session is tied to the old folder.
  - `broke-app` moves as `needs-you` with "This change broke the app on X, so it did not move to Y. Try again to make it from the request, or dismiss it."
  - Each old overlay that had changes gets a `.migrated` file with the date. `removeOldOverlays()` deletes version folders 30 days after that.
- Runner: for a `replay`, `overlay.applySourcePatch()` (`git apply --3way --directory=source`) runs first, then `buildReplayPrompt()`. It either says the source part is applied and only `build/` needs the matching edit, or that it did not apply and both sides need it, or that no diff exists. It also tells Claude to change nothing if the new version already does what was asked. On success `replay` is cleared. A failed replay keeps it, so "Try again" replays again. Queue order is kept, so moved changes run before newer requests.
- The new overlay only turns on once the first replayed change is ready, so the app runs as shipped until then. The toast then offers a restart.
- UI: a banner "Moving N local changes to X. The app runs as it shipped until they are ready.", queued replays say "moving from X", and landed changes show "In the app" with no actions.
- Tests: `replay.test.ts` (source applied and build redone, source not fitting, waiting and broken requests, old overlays deleted after 30 days) and two cases in `pull-request.test.ts` (merged and in the new tag means landed; merged after the release means replayed). An older runner test that expected old-version requests to stay queued was updated, since they now move. Checked in a browser with the CLI and a fake `claude`: an applied change from 0.2.16 was replayed on 0.2.17 and committed, and a landed one showed "In the app". Not tested with two real packaged app versions.

### Step 13. CLI

- Same overlay module with the CLI root. `bin/pull-review.mjs` checks the active CLI overlay and imports its `cli.mjs` when the version matches. The server serves the overlay's `web/` folder.
- Same Feedback page and picker (it's the same web code). The toast says "Restart the CLI" for backend changes.
- The CLI's change list is separate from the app's.

**Result (2026-11-05):**

- `bin/pull-review.mjs` now imports `out/loader.mjs`, built from `src/server/cli-loader.ts` as a separate tsdown build. With both entries in one build, tsdown would split shared code into a chunk that the overlay's single `cli.mjs` could not find.
- The loader imports the overlay's `build/cli.mjs` when `cli-overlay/active` names this version and `--shipped` isn't given, else the shipped `out/cli.mjs`. It sets `__pullReviewOverlay` and `__pullReviewShipped` (declared in `src/shared/self-improve-globals.d.ts`, which replaces the tiny-only declaration).
- Node can catch a module that throws while loading, unlike txiki.js. So a broken overlay prints "The changed command line tool did not start: … Your local changes are off now. Starting pull-review as it shipped.", writes `active` = `off` and `boot-failure.json`, and runs the shipped CLI. The CLI then marks the newest change `broke-app` through `__pullReviewStartFailure`.
- The overlay's `cli.mjs` finds `web/` next to itself, so the server serves the overlay page with no extra code. New overlays still copy the shipped files through `__pullReviewShipped`. `index.html` is read per request now, so a reload picks up a changed page.
- `--shipped`: new CLI option, "Run without your local changes from the Feedback page".
- Applied: in a browser the page calls `POST /self-improve/applied` once React has mounted (the desktop app keeps using `bootReady`). The service only marks changes applied when an overlay is actually running (`running().overlay`), so loading the shipped page never counts. The CLI reports `canRestart: false`, so the toast says "Reload" for page-only changes while the overlay runs, and otherwise says to restart in the terminal.
- `cliOverlayRoot()` and `openFolderCommand()` (`open` on macOS, `xdg-open` elsewhere) are in `src/server/self-improve/cli-overlay.ts`, with tests.
- There's no ready check with a timer for the browser page. If a changed page breaks, the user runs `pull-review --shipped` and undoes it from the Feedback page.
- Checked with the real CLI build: an active overlay served the changed page, `--shipped` served the original, and a throwing `cli.mjs` fell back with the message, turned local changes off and recorded why.

### Step 14. Docs, tests and release

- Unit tests for: prompt building, context trimming, `changes.json` state moves, source tree from source maps, patch prefix stripping, the "applies alone or depends on" choice, and the merged-PR check.
- README: a "Self-improve" section covering what it does, where files live, how to turn it off, and that Claude runs with the user's own rights.
- Ship the header buttons with a "Beta" label, like the Releases page.

**Result (2026-11-05):**

- README: new "Feedback and local changes (beta)" section (how to use it, what goes to Claude, the rights warning in bold, how it works, how to skip or turn off local changes, PRs, updates). The desktop security notes now list `bootReady` and `restartApp` and explain `readAccess`.
- The rights notice ("Claude changes your copy of the app with your Claude Code settings, so it can edit files and run commands on this computer.") shows under the request box on the Feedback page, and in the composer until the first request exists.
- Header buttons say "(beta)" in their tooltips. The Feedback page has the Beta badge.
- Version 0.2.20 in `package.json` and `tinyjs.json`, with a `CHANGELOG.md` entry (shortcuts and commands in backticks).
- Final check: 60 test files, 431 tests, type check, CLI build, desktop build. The built app starts, and `pull-review --help` shows 0.2.18 and `--shipped`.

## Status

All 14 steps are done on the `self-improving-app` branch. Not yet done or seen:

- A real "Send as PR" against GitHub. All PR tests used local repositories and a fake `gh`.
- An update between two real packaged versions. Replay was tested with the Node host and the CLI.
- Clicking Reload or Restart inside the desktop app window, and holding ⌥ at launch.
- A ready check with a timer for the CLI's browser page.
- Merging to `main`, which releases 0.2.20 through CI.

## Risks and open points

- **Full Claude rights.** Claude can run any command the user's settings allow. The prompt sets the overlay as its scope, but nothing enforces it. Say this clearly in the README and on first use.
- **Secrets in the screenshot.** Diffs and comments on screen go to Claude and, if the user chooses, into a GitHub PR. Strip the screenshot from PRs and issues by default.
- **Build size.** Unminified bundles and maps make the download bigger. Step 2 measures it.
- **Panda CSS drift.** Hand-written CSS in `build/` may not match what Panda would make from `source/`. The PR is what counts, the local build only has to look right.
- **txiki.js dynamic import.** Step 1 may find that the backend overlay needs a different loading trick.
- **Source maps can lag source.** Files with no JSX or that are fully tree-shaken won't be in the maps, so `source/` is partial. Claude must be told that `source/` is not the whole repo. The PR step applies to a real clone, so missing files there are fine.
