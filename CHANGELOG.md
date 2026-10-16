# Changelog

## 0.2.8 (2026-10-16)

### Fixing review comments

- Threads you fixed with a Claude patch show "Fixed locally" until you push. Mark or unmark threads yourself too.
- File chips in Claude's steps show the full path and open the file.
- Markdown patches no longer get cut off in the chat.

### Commits

- "Plan atomic commits with Claude" can split one file into several commits, and writes plain messages without [TAG] prefixes.
- See what goes into each commit, planned or unpushed, in a window.

## 0.2.7 (2026-10-16)

### Review with Claude

- New Review tab in the Claude sidebar. Claude reviews the merge request and adds draft comments on the exact lines, like Copilot or CodeRabbit.
- Edit and preview each draft, then post it or post them all. Comments are posted from your account, in [Conventional Comments](https://conventionalcomments.org/) style, with a GitLab suggestion when the fix fits.
- Choose Focused (real problems only) or Thorough (also nitpicks, typos and praise), and the model and effort.
- Jump between findings with the up and down arrows next to the tabs.
- Settings, AI: turn the "Found by Claude" signature on or off, or change its text.

### Other changes

- Chat answers and reviews show Claude's steps as a timeline.
- The effort picker is a small slider.
- Tooltips are dark in the dark theme and have an arrow.
- Small text (`<sub>`) in comments no longer shows as raw tags.

## 0.2.6 (2026-10-13)

### Claude chat

- Select code and review comments with the mouse to add them to your question, including each comment's author.
- Claude reads all review threads, so "fix this based on the comment" just works.
- Pick the model and effort in the bottom left of the chat box.
- Faster answers: Claude reads only the files it needs and doesn't re-read them on every message.
- See exactly what Claude gets: click a chip, use Preview, or "View what was sent" on a sent message.
- Chats are saved and survive restarts. Unused chats are deleted after 30 days.

### Fixing code

- Claude answers fix requests with a patch, shown in the same diff viewer as the review.
- Under a patch: Copy, Apply to local repository, or Suggest in GitLab.
- Suggest in GitLab opens prefilled suggestion comments on the changed lines. Nothing is posted until you click Comment.
- Suggestions in comments show as a "Suggested change" box, like on GitHub.

### Local changes

- New Local changes tab lists uncommitted changes in your local repository, with a diff per file and Discard.
- Commit and push from the tab. "Plan atomic commits with Claude" splits the changes into commits with messages in your repository's style.
- Planning uses its own model and effort, Haiku with low effort by default.
- Pushes never force. If GitLab has newer commits, nothing is overwritten and your commits stay local.
- New "Open in editor" button in each file header.

### Images

- Git LFS images show as images again.
- New Difference (pixel diff, like Playwright) and Onion skin comparison modes.

### Fixes

- Apply to local repository failed for patches that changed more than one file.
- Patches in the chat could show no lines until the Code tab was opened.
- Opening a merge request could move the worktree away from unpushed commits.
- Settings export now includes the local repository found where you started the CLI.
- The Local changes tab ignored the split or unified layout and line wrap settings.
- Icons in the layout toggle weren't centered.
- Dropdowns now use the same styled menu everywhere instead of the browser's own.

## 0.2.5 (2026-10-12)

- Click a function, variable or type name in a diff to see its definition and references in a panel styled like GitHub's: the kind and name at the top, the definition, references grouped by file with counts, arrows that step through the references in this review, and a link to search for the name in GitLab. Code lines are syntax colored with the same GitHub theme as the diff. Names are underlined when you point at them.
- With a local repository for the project, the whole repository is searched at the merge request's commit. Without one, only the changed lines are searched.
- Click a result to jump to it in the review when the line is in the diff, or open it in GitLab. With a local repository you can also open it in your code editor.
- Settings, General has one local repository, for the GitLab project chosen there. Repositories linked while reviewing other projects are listed under "Other projects".
- Adding a local repository now asks how to use it. "Create a worktree for Pull Review" makes a new git worktree next to your clone (for example `tradelocker-review`), so your own folder is never touched. "Use this folder" is for a worktree you already made for reviews. A main checkout can't be used directly.
- When you open a merge request, Pull Review switches the project's worktree to the merge request's branch and its latest commit, so opening files in your editor shows the right code. It doesn't switch when the worktree has uncommitted changes. If your local branch has commits that aren't in the merge request, it leaves the branch alone and checks out the merge request's commit without a branch. A label next to the branches in the review header shows the result.
- Opening a file in your editor now opens the local repository's worktree as a folder. If a window already has it open, that window is used. Otherwise a new window opens, instead of the file landing in whatever window was last active.
- New "Code editor" setting in Settings, General. Pull Review finds the editor that is running, or you can pick one: VS Code, Cursor, Windsurf, Zed, Sublime Text, JetBrains editors and others.

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
