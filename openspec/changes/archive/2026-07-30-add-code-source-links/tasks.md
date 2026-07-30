## 1. Selector line-number resolution

- [x] 1.1 Change `resolveSnippetSelector` in `composables/useSnippetImport.ts` to return `{ text, startLine, endLine }` instead of a plain string, computing `startLine`/`endLine` for the whole-file, line-range, and content-anchor-range cases (1-based, matching the file's real line numbers)
- [x] 1.2 Update `setup/transformers.ts`'s call site to use the new return shape
- [x] 1.3 Update `composables/__tests__/useSnippetImport.spec.ts` for the new return shape across all selector kinds

## 2. Git remote/branch/URL resolution

- [x] 2.1 New composable (e.g. `composables/useSourceLink.ts`, Node-only) that: walks up from a given file path to its nearest `.git`, reads the `origin` remote URL, parses `git@github.com:owner/repo.git` and `https://github.com/owner/repo(.git)` forms into `{ owner, repo }`, and returns `null` for a missing or non-GitHub remote
- [x] 2.2 Branch resolution: configured value, else local `git symbolic-ref refs/remotes/origin/HEAD` (parsed to a bare branch name), else `null`
- [x] 2.3 Compose `{ owner, repo, branch }` + the file's path relative to the resolved repo root + `{ startLine, endLine }` into the final `https://github.com/<owner>/<repo>/blob/<branch>/<path>#L<start>-L<end>` URL (no fragment when there's no selector)
- [x] 2.4 Cache resolution per dev-server process, keyed by resolved repo root, so repeated renders don't re-shell out to `git`
- [x] 2.5 Unit tests: remote URL parsing (SSH/HTTPS/with-and-without `.git`), missing/non-GitHub remote → `null`, branch resolution order, URL/fragment assembly
- [x] 2.6 (addendum) Fall back to `git ls-remote --symref origin HEAD` when the local `refs/remotes/origin/HEAD` symref is unset (e.g. a repo not set up via a plain `git clone`) -- discovered when this repo's own checkout hit exactly this case; unit tests cover local-symref-preferred, fallback-to-remote, and neither-resolves

## 3. Directive and marker parsing

- [x] 3.1 `[!source ...]` directive-line parsing in `composables/useSnippetImport.ts` (or a sibling), mirroring `isAnchorDeclarationLine`'s pattern: recognize `[!source https://...]`, `[!source none]`, `[!source bottom]` immediately following a `<<<` import line
- [x] 3.2 Inline `// [!source <url>]` / `# [!source <url>]` marker parsing for hand-typed fences, reusing `MARKER_RE`'s comment-style convention from `composables/useCodeHighlights.ts`; strip the marker line from rendered code
- [x] 3.3 Unit tests for both directive and inline-marker parsing, including malformed/missing cases

## 4. Wiring link data through the transform pipeline

- [x] 4.1 Extend the sentinel-based payload passed from the `pre` stage to the `codeblocks` stage in `setup/transformers.ts` (alongside the existing anchor-lines sentinel) to carry resolved/overridden link data and bottom/none/title-icon placement decision
- [x] 4.2 Remove the `codeblocks` stage's "no highlights → return undefined" shortcut whenever link data is present, so the custom `<CodeBlockWrapper>` wrap always runs for any fence carrying a source link (with or without highlights)
- [x] 4.3 Extend `wrapInCodeBlockTitle` (or its replacement) to inject a source-link icon element beside the title when placement is title-icon
- [x] 4.4 For bottom-placement fences, emit whatever marker/data the `default.vue` layout needs to collect and render the bottom row (e.g. a data attribute or a slide-scoped registry, consistent with how highlight metadata already reaches the layout)

## 5. Bottom-row rendering

- [x] 5.1 In `layouts/default.vue`, collect all bottom-placed source links present on the current slide (from `notitle` imports, manual fences with no title, or `[!source bottom]`)
- [x] 5.2 Render them as a simple horizontal icon row along the bottom of the slide, each icon linking out, with the source file/URL as a hover tooltip
- [x] 5.3 Handle the zero-links case (no row rendered) and the multi-link case (row grows horizontally without overlapping other fixed elements)

## 6. Config

- [x] 6.1 Add the configurable branch-override value alongside the existing code-root configuration convention

## 7. Tests and docs

- [x] 7.1 E2e coverage: title-icon rendering for a titled import with a resolved link
- [x] 7.2 E2e coverage: bottom-row rendering for a `notitle` import and for a manual `// [!source ...]` block
- [x] 7.3 E2e coverage: `[!source none]` suppresses the link; `[!source https://...]` overrides it; `[!source bottom]` forces bottom placement despite a title
- [x] 7.4 E2e or unit coverage: no-GitHub-remote / no-origin repo produces no link, silently
- [x] 7.5 Update `CLAUDE.md` with the new marker/directive grammar tables, following the existing style for `code-snippet-import` and `code-highlight-marking`

## 8. Verification

- [x] 8.1 `pnpm test`
- [x] 8.2 `pnpm test:e2e`
