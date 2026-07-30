## Why

A slide showing imported or hand-typed code gives the audience no way to jump to the real source — they have to already know the repo layout or ask the presenter. Since `<<<`-imported snippets already know their file path, and this project's own repo (and most consumer projects) live on GitHub, most of that link can be produced automatically instead of hand-authored per slide.

## What Changes

- A `<<<` snippet import automatically resolves a GitHub source link when the file's nearest enclosing `.git` repo has a `github.com` `origin` remote: `https://github.com/<owner>/<repo>/blob/<branch>/<path-in-repo>#L<start>-L<end>`.
  - Branch resolution: an explicit configured branch, else the repo's actual default branch via `git symbolic-ref refs/remotes/origin/HEAD`.
  - Line-range fragment: derived from the import's selector (line-range or resolved content-anchor range). `resolveSnippetSelector` gains matched start/end line numbers in its return value to support this (existing call sites and tests updated accordingly).
  - A repo with no `origin` remote, or a non-GitHub remote, silently produces no link (console warning is not needed — matches this project's degrade-quietly-when-nothing-to-show precedent for optional decoration).
- A new `[!source ...]` directive line, placed immediately after a `<<<` import line (alongside existing `[!mark:...]` anchor-declaration lines), overrides the default per-import:
  - `[!source https://...]` — replace the auto-detected URL.
  - `[!source none]` — suppress the link entirely for this import.
  - `[!source bottom]` — force bottom-row placement even though the import has a title.
- A new inline `// [!source https://...]` marker (reusing the existing `//`/`#` comment-marker convention from `[!mark]`), placed as its own line inside a hand-typed fenced code block, attaches a manually-specified link to a block with no backing file. No auto-detection is attempted for these — there's no file path to resolve against.
- Rendering:
  - When the code block has a visible title (import with a title, or `[title]` on a manual fence) and no `bottom` override, the link renders as a small clickable icon beside the title text.
  - When the code block has no visible title (an import with `notitle`, or a manual fence with no `[title]`), or `bottom` was set, the link renders instead as an icon in a row along the bottom of the slide (one icon per such block on that slide), with the source file/URL shown as a hover tooltip. No connector line back to the block.
- **BREAKING** (internal only, not consumer-facing): `resolveSnippetSelector`'s return type changes from a plain string to an object carrying the sliced text plus matched start/end line numbers.

## Capabilities

### New Capabilities
- `code-source-links`: link resolution (GitHub remote/branch/path/line-range detection), the `[!source ...]` directive and inline-marker syntax, and the title-icon / bottom-row rendering split.

### Modified Capabilities
- `code-snippet-import`: `resolveSnippetSelector`'s signature changes to also report matched line numbers, and an import's rendered title bar may now show a source-link icon alongside the existing basename title.

## Impact

- `composables/useSnippetImport.ts`: `resolveSnippetSelector` returns matched line numbers; parsing for the `[!source ...]` directive line (mirroring `isAnchorDeclarationLine`).
- `composables/useCodeHighlights.ts` (or a new sibling composable): inline `// [!source ...]` marker parsing, reusing `MARKER_RE`'s comment-style convention.
- New composable for git-remote/branch/URL resolution (Node-only; cached per dev-server process, not re-run per render).
- `setup/transformers.ts`: `codeblocks` stage stops short-circuiting to Slidev's native transformer whenever a resolved/overridden source link is present, even without highlights; threads link data into the custom `<CodeBlockWrapper>` wrap.
- `layouts/default.vue`: new bottom-row rendering for untitled/bottom-forced code blocks' source-link icons, alongside the existing callout-placement logic.
- `composables/__tests__/`: new unit coverage for selector line-number resolution, `[!source ...]` parsing (both forms), and remote/branch/URL resolution.
- `tests/`: new e2e coverage for title-icon rendering, bottom-row rendering, and the override/suppress directives.
- `openspec/specs/code-snippet-import/spec.md`: delta spec for the modified requirement.
- `openspec/specs/code-source-links/spec.md`: new spec (via this change's `specs/` delta, synced on archive).
