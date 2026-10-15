# Gamification plan

## Points for each kind of comment

| Kind of comment | Points multiplier |
|---|---|
| Written by AI (from the app's Claude suggestions or detected as pasted) | 0.5x |
| Unverified (written in the GitLab web interface, so there is no marker) | 1x |
| Hand-typed | 1x up to 2x, based on the hand score |

Stars and approvals add bonus points on top, the same way for every kind of comment.

## Leaderboard covers both projects and groups

- A switch at the top of the leaderboard changes between **Project** and **Group** views.
- GitLab has no group-level comment events API. For the group view, the app lists the group's projects, fetches events for each one, and caches the results locally so it doesn't call GitLab again every time.
- Both views use the same scoring function, so the numbers always match.

## Themes

1. **Move the current theme** out of `panda.config.ts` into its own folder, `src/web/theme/classic/` (index, tokens, semantic tokens, recipes), and name it **Classic**. The app looks exactly the same afterwards.
2. **Create the new theme** in `src/web/theme/tavern/` with the same files, and name it **Tavern**. It follows the [warcraftcn-ui](https://github.com/TheOrcDev/warcraftcn-ui) style: wooden panels with iron frames, blue command buttons and bundled fantasy fonts.
3. Load both through Panda's `themes` feature, switched by a `data-panda-theme` attribute on the page. Tavern recipes only override Classic recipes while Tavern is on.
4. Add a theme picker to the settings dialog and save the choice in `src/web/lib/preferences.ts`. Settings backup includes it automatically.
5. Ranks, achievements and game wording only appear with Tavern. Classic stays plain, with an ordinary leaderboard.

Classic has light and dark versions today. Tavern starts with only a dark version, because candlelight and wood look best on dark, and gets a light version later if needed.

## Build order

1. Move the theme into Classic and add the theme switcher (low risk, so it goes first)
2. Scoring function and tests
3. Events fetching, caching, and the leaderboard API for projects and groups
4. Leaderboard screen
5. Typing tracker and the hidden marker in comments
6. Tavern theme, ranks and achievements

Each step gets a patch version bump and a changelog entry.
