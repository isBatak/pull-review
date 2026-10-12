# Changelog

## 0.2.4 (2026-10-12)

- Local repositories moved from the AI tab to the General tab in Settings, because other features that need the full repository can use them too. The AI tab now explains how they are used for the Claude chat.

## 0.2.3 (2026-10-12)

- New AI tab in Settings. It shows whether Claude Code is installed, holds the "Selected lines in the Claude chat" setting (moved from General), and lists the local repository folders you added for the chat. You can add, change and remove folders there.

## 0.2.2 (2026-10-12)

- New setting in Settings, General: "Selected lines in the Claude chat". Choose "Add automatically" to add selected lines to your question right away, or "Add with a button" to add them only when you click Ask Claude in the file header. The default is automatic.

## 0.2.1 (2026-10-12)

- While the Claude chat is open, lines you select in a diff are added to your question right away. Selecting other lines replaces them, and the X on the chip removes them.
- To include several parts, click the sparkles button in the file header to keep the current lines, then select the next ones.

## 0.2.0 (2026-10-12)

- New Claude chat panel on the right of the review page. Ask about the merge request, get a summary, or ask about specific code.
- Select lines in a diff and click "Ask Claude" to include them in your question. The button on a file header without a selection includes the whole file.
- The chat uses your installed and signed-in Claude Code, so no API key is needed. Without Claude Code, the chat is hidden.
- Add your local copy of the repository and Claude can read full files. The app makes a temporary git worktree at the merge request's commit and removes it when you leave the merge request for 30 minutes or quit.
- You can resize the chat panel or close it.

## 0.1.1 (2026-10-12)

- The app version now shows as a small badge next to the project name in the header.

## 0.1.0 (2026-10-12)

First release.

- Review GitLab merge requests locally with grouped, readable diffs.
- CLI that opens a merge request from a link, a `group/project!42` reference, or the current git branch.
- macOS desktop app built with tinyjs.
- Reads the GitLab token on the server side from environment variables or `glab`.
- Merge request list with filters, team members and stacked merge requests.
- Review comments, image diffs and bundle size changes.
- Settings for teams, file categories, bundle tracking and backup.
