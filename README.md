# pull-review

Review GitLab merge requests locally with grouped, readable diffs. A GitLab-only take on [pulls.review](https://github.com/antfu/pulls.review), built with React, [Panda CSS v2](https://panda-css.com), [Ark UI](https://ark-ui.com) and [@pierre/diffs](https://www.npmjs.com/package/@pierre/diffs).

## Usage

```sh
pnpm install
pnpm build
node bin/pull-review.mjs https://gitlab.com/group/project/-/merge_requests/42
```

The CLI starts a server on `127.0.0.1` (port 5179, or the next free one) and opens the review in your browser.

```sh
pull-review https://gitlab.com/group/project/-/merge_requests/42/diffs
pull-review group/project!42 --host gitlab.com
pull-review                 # the open MR for the current git branch
pull-review --port 6000 --no-open
```

## macOS app

The desktop app is built with [tinyjs](https://tinyjs.app): the macOS system web view plus the txiki.js runtime, about 25 MB in total.

```sh
curl -fsSL https://tinyjs.app/install | TINYJS_VERSION=v0.50.1 sh   # once, installs the pinned tinyjs CLI
pnpm desktop:install                          # builds "Pull Review.app" and copies it to /Applications
```

| Script | What it does |
|---|---|
| `pnpm desktop:dev` | Runs the app with the Vite dev server and hot reload |
| `pnpm desktop:build` | Builds `dist/Pull Review.app`. Add `--universal` for one app that runs on Apple Silicon and Intel |
| `pnpm desktop:install` | Builds and copies the app to `/Applications` |
| `pnpm desktop:zip` | Builds a universal app and zips it to `Pull Review <version>.zip` for sharing |

How it fits together:

- The page loads from `file://`, so the app uses hash routes (`#/gitlab.example.com/...`).
- There is no local server. The page sends every API and icon request through `tiny.api.call('request')`, and the backend (`src/tiny/main.ts`) answers it with the same Hono routes the CLI serves. Images travel as base64.
- The backend reads `PATH` and `GITLAB_*` variables from your login shell, so a Homebrew `glab` works when the app is opened from Finder.
- Links to GitLab, Jira and other sites open in your default browser.
- `tinyjs build` owns `dist/`, so the project's own builds go to `out/`.

Security settings for the desktop app:

- `tinyjs.json` `"api"` lets the page call only `request`, `shell.open` and `clip.write`. tinyjs has about 140 other built-in calls, such as AppleScript, secrets and clipboard reading, and the page can't reach them. Add a call to both origin lists only if the frontend really needs it.
- `onNavigate` in `src/tiny/main.ts` keeps the window on the app's own pages. Web and mail links open in your default apps, and other links are blocked.
- Production builds carry a Content Security Policy (`build/content-security-policy.ts`), so the page runs only its own scripts.
- The desktop scripts check that the installed tinyjs is the version pinned in `package.json` (`pinned.tinyjs`). Read the tinyjs changes before you move the pin.

The app is ad-hoc signed. That's fine for an app you built yourself. To share it, sign it with a Developer ID (`signIdentity` in `tinyjs.json`) and run `tinyjs notarize`.

## Claude chat

The review page has a Claude chat panel. Open it with the sparkles button in the header. It shows up only when [Claude Code](https://claude.com/claude-code) is installed.

- The chat runs your installed `claude` command, so it uses your Claude Code login and subscription. It removes `ANTHROPIC_API_KEY` from the environment, so you are never billed through the API by accident.
- Claude gets the merge request description and full diff. It can only read and search files. It can't run commands or change anything.
- Select lines in a diff (click a line number, then Shift-click another). While the chat is open they are added to your question right away. To add them only with the **Ask Claude** button instead, change "Selected lines in the Claude chat" in Settings, AI. To include several parts, click the sparkles button in the file header to keep the current lines, then select the next ones.
- To let Claude read whole files, add a local repository: click **Add folder** in the chat, or use Settings, General, Local repositories. The CLI fills this in when you start it inside a matching clone. The app then makes a git worktree at the merge request's head commit in `~/Library/Caches/pull-review`, fetching `refs/merge-requests/<iid>/head` if needed. Your own checkout and branch stay untouched.
- Worktrees are removed when a merge request's chat is unused for 30 minutes, when the CLI quits, and on the next start after a crash or after the desktop app quits.

## Local repositories

Settings, General, Local repository links the GitLab project to a git worktree on your computer. If you review merge requests from other projects, you can link those from the Claude chat panel, and they are listed under "Other projects".

- When you add a folder, Pull Review offers to create a new worktree from it (`<repo>-review` next to your clone by default), or to use the folder as it is if it is already a worktree. Your main checkout is never used directly, so its branch is never switched.
- When you open a merge request, the worktree is switched to the merge request's source branch at its latest commit: a new local branch is created (tracking the remote branch when it matches), or an existing one is fast-forwarded. Nothing is switched while the worktree has uncommitted changes. If the local branch has commits that are not in the merge request, it is left alone and the commit is checked out without a branch.
- The label next to the branches in the review header shows the result. Click it to try again.

## Definitions and references

Click a name in a diff to see where it is defined and used.

- With a local repository for the project (Settings, General, Local repository), Pull Review runs `git grep` on the merge request's commit, so the whole repository is searched without a checkout. Without one, only the changed lines are searched.
- Results are search-based, like GitHub's code navigation for most languages: a line counts as a definition when it looks like `function name`, `const name =`, `class name` and similar. Different symbols with the same name are not told apart.
- A result opens in the review when its line is in the diff, otherwise in GitLab. With a local repository it can also open in your editor. The editor is found the same way [launch-ide](https://github.com/zh-lx/launch-ide) does it (the running editor process first), or you pick one in Settings, General. The editor opens the worktree folder in its own window (reusing a window that already has it open) and jumps to the line. Pull Review uses the command line bundled in the editor app, so `code` and similar commands don't need to be on your `PATH`.

## Authentication

The server reads the token and calls the GitLab API itself. The token never reaches the browser. It looks for one in this order:

1. `PULL_REVIEW_GITLAB_TOKEN_<HOST>`, for example `PULL_REVIEW_GITLAB_TOKEN_GITLAB_COM`
2. `PULL_REVIEW_GITLAB_TOKEN`, `GITLAB_TOKEN`, `GITLAB_PRIVATE_TOKEN`, `GLAB_TOKEN`, but only for trusted hosts
3. `glab config get token --host <host>`, so a signed in `glab` works with no setup

Trusted hosts are those in `PULL_REVIEW_GITLAB_HOSTS` (comma separated) and `GITLAB_HOST`. If neither is set, the only trusted host is `gitlab.tradelocker.com`. This keeps a generic token from being sent to a different server, for example when you open a link to an unknown GitLab host.

Posting and resolving comments needs a token with the `api` scope.

## Features

- Files grouped by rules: code, tests, docs, config, dependencies, generated
- Split or unified diffs with syntax highlighting, word-level changes and line wrap
- Expand unchanged context, loaded on demand from the repository
- Line comments: hover a line and click `+`
- Reply to, edit, delete, resolve and unresolve threads
- General MR comments, plus a list of outdated threads
- Approve and revoke approval
- Mark files as reviewed. This is stored in the browser and flags files that changed since you reviewed them
- Bundle size comparison with the base branch, from CI artifacts
- Light and dark theme

## Categories

Files in a review are grouped into categories, which you can edit in Settings, Categories. The first category whose rules match a file wins, in list order. Code (text files nothing else claims) and Other (binary files nothing else claims) are built in.

One rule per line:

| Rule | Matches |
|---|---|
| `*.po`, `Dockerfile*`, `package.json` | A file name in any folder |
| `locales/` | Everything inside any folder named `locales` |
| `libs/frontend/` | Everything inside that folder from the repository root |
| `libs/**/tests/**` | The full path, as a glob |
| `/\.e2e\.ts$/i` | The full path, as a regular expression |
| `# note` | A comment |

A category can collapse its files by default and keep some of them expanded. The default Translations category, for example, collapses every language except English. Use "Test a file path" in the Categories tab to see which category and rule a path lands on.

## Bundle analysis

The Bundle tab of a review compares the Next.js bundle of the merge request with the base branch. It reads the raw CI artifacts, not the bot comment, so the bot comment is hidden from Overview.

- **This MR**: the newest successful CI job in the merge request pipelines that kept the analysis file.
- **Base**: the newest successful job in a push pipeline on the base branch whose commit the merge request is built on. This is the same rule as `bundle-analysis-fetch-base.js`.

It shows:

- Totals, shared chunks and the heaviest first load
- Routes with first load JS, the change against the base and a budget bar, with each route's chunks
- A zoomable treemap of every client chunk and its modules, coloured by how much each tile grew or shrank
- Size changes per npm package and workspace library
- Server route sizes

Settings, Bundle sets the job name, the base branch, both artifact paths, the budget and the threshold. The defaults fit the `tradelocker` frontend app:

| Setting | Default |
|---|---|
| CI job | `fe:build-arm64:app` |
| Route sizes artifact | `apps/frontend/app/.next/analyze/__bundle_analysis.json` (nextjs-bundle-analysis) |
| Module stats artifact | `apps/frontend/app/.next/analyze/client.json` (`@next/bundle-analyzer` with `analyzerMode: 'json'`) |
| Budget | 614400 bytes of gzipped first load JS |
| Threshold | 1024 bytes |

Without the module stats, the treemap is skipped. Module colours need module stats on both sides, so they appear once the base branch builds them too.

## Settings backup

Settings, Backup exports your project, Jira site, teams, categories, bundle settings, layout choices, theme and sidebar width to a JSON file, and imports such a file. Share the file to give a team the same teams and categories. Your GitLab token and review progress are never included.

## Development

```sh
pnpm dev          # API on :5174 and Vite on :5173
pnpm test
pnpm typecheck
```

`src/server` holds the CLI, the Hono server and the GitLab client. `src/web` holds the React app. `src/shared` holds code both use: URL parsing, grouping, and line mapping for GitLab comment positions.

The API only answers requests with a `localhost` Host header and an `x-pull-review` header. This blocks other websites and DNS rebinding from using your token.

## Not done yet

- GitLab CI job that posts an MR note linking to a hosted review page
- Multi-line comments (comments attach to the last selected line)
- Draft reviews (batched comments that publish together)
