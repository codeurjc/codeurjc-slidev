## Context

Two rendering paths exist today for a fenced code block:

1. Slidev's own native `wrapper_default` codeblocks transformer, which parses `lang [title] {ranges}` and wraps the fence in `<CodeBlockWrapper title="...">`. This project has never touched that path when there are no highlights.
2. This project's own `codeblocks` transformer in `setup/transformers.ts`, which intercepts a fence **only when it has highlights** (inline `[!mark]` markers or external anchor lines), builds the highlighted HTML, and reconstructs the same `<CodeBlockWrapper>` wrapping itself via `wrapInCodeBlockTitle`.

`CodeBlockWrapper.vue` and `TitleIcon.vue` (read directly from `@slidev/client`) confirm the native title bar is non-interactive: an icon `<div>` (matched from a static extension map or an inline `~icon-name~` override) plus a text `<div>`, no anchor, no slot for extra content. A clickable source-link icon cannot be bolted onto the native title bar — any code block with a source link must go through this project's own wrap, whether or not it has highlights.

## Goals / Non-Goals

**Goals:**
- Auto-resolve a GitHub source link for `<<<`-imported snippets from the nearest enclosing git repo's `origin` remote, with a configurable-or-auto-detected default branch, deep-linked to the selector's line range.
- Let a presenter override (`[!source <url>]`), suppress (`[!source none]`), or force bottom placement (`[!source bottom]`) per import via a directive line, mirroring the existing `[!mark:...]` anchor-declaration convention.
- Let a presenter manually attach a link to a hand-typed fenced block (no backing file) via an inline `// [!source <url>]` marker, mirroring the existing inline `[!mark]` convention.
- Render the link as an icon beside the title when a title is shown; otherwise (no title, or `bottom` forced) as an icon in a row along the bottom of the slide, one per such block, tooltip = filename/URL, no connector line.

**Non-Goals:**
- Non-GitHub remotes (GitLab, Bitbucket, self-hosted) — out of scope for auto-detection; a manual `// [!source ...]` / `[!source <url>]` override still works for any URL, it's only the *auto-detection* that's GitHub-specific.
- Per-block connector lines from the bottom row back to their code block (rejected during exploration — a simple row with tooltips was chosen over reusing `useHighlightLayout.ts`'s connector routing).
- Editor drag-repositioning of source-link icons (unlike callouts). They auto-place; no persisted position.

## Decisions

- **Resolution point: reuse `resolveSnippetSelector`'s existing line-slicing rather than re-deriving line numbers elsewhere.** It already computes `startIdx`/`endIdx` for content-anchor ranges internally and discards them. Change its return type from `string` to `{ text: string, startLine: number, endLine: number }` (1-based, matching the file's real line numbers) so both the rendered code and the GitHub `#L<start>-L<end>` fragment come from one resolution instead of two independently-computed ranges that could drift apart. All call sites (`setup/transformers.ts`) and its unit tests update accordingly. Accepted as an internal breaking change since nothing external depends on this composable's signature.

- **Git remote/branch resolution lives in a new Node-only composable, resolved once and cached per dev-server process** (keyed by the resolved repo root), not recomputed per fence render. Rationale: `git` subprocess calls on every HMR re-render of every snippet-import slide would be wasteful and slow down the dev loop; the remote URL and default branch don't change within a single dev-server session. Cache invalidation is a non-concern — a repo's remote doesn't change mid-session, and if it does, restarting the dev server (already the norm after `git` operations like branch switches) picks it up.

- **Nearest-`.git` walk-up from the imported file's directory, not the project root.** A scaffolded consumer project's `code/` could in principle be a separate nested repo (e.g. a git submodule of student exercises). Walking up from the file itself (same pattern as resolving `isWithinCodeRoot`) is more correct than assuming the repo root is the Slidev project root.

- **Branch resolution order: configured value → local `git symbolic-ref refs/remotes/origin/HEAD` → `git ls-remote --symref origin HEAD` → no link.** A configured branch is a deliberate override (e.g. a course wants links pinned to a `2026-fall` branch); when unset, asking git for the remote's actual default HEAD is more correct than hardcoding `main` (repos still using `master`, or a differently-named default, resolve correctly). The local symref is only ever written by `git clone` itself or an explicit `git remote set-head origin -a` — not by a plain `fetch`/`pull` — so a repo set up any other way (or copied without that one ref file) has it missing even though its remote reports a default branch perfectly well; `ls-remote --symref` asks the remote directly and covers that gap, at the cost of one network round-trip, which the per-repo-root cache limits to once per dev-server session. If neither resolves (e.g. genuinely offline, or the remote itself has no default branch) the link is silently omitted — no warning, since this is optional decoration, matching the project's existing "degrade quietly" precedent for auto-detected niceties (contrast with the `code-root` warning, which guards an authoring mistake, not an environment limitation).

- **Directive syntax reuses two existing conventions rather than inventing a third:**
  - For `<<<` imports: a standalone `[!source ...]` line after the import, in the same position as `[!mark:...]` anchor-declaration lines (parsed the same way `isAnchorDeclarationLine` distinguishes anchor lines from snippet-import lines).
  - For manual fences: an inline `// [!source <url>]` marker line, reusing `MARKER_RE`'s existing `//`/`#` comment-style convention, stripped from rendered code like `[!mark]` is.
  This mirrors the project's existing duality (inline markers for hand-authored code vs. external directive lines for imports where the file itself must stay unmodified) instead of introducing a single new mechanism that would have to awkwardly serve both cases.

- **Title-icon vs. bottom-row is a rendering fork inside one always-on `codeblocks` interception, not two separate transformers.** Whenever a fence carries link data (auto-resolved or directive-supplied) or highlights, the `codeblocks` stage now always builds the custom wrap; the "just let Slidev's native transformer handle it" shortcut only remains for plain fences with no link and no highlights. Link metadata travels from the `pre` stage to the `codeblocks` stage the same way anchor lines already do: appended behind a sentinel in the fence's code text (a new sentinel block alongside `ANCHOR_BLOCK_SENTINEL`, or an extension of the same combined-payload format), since `ctx.info`/`ctx.code` are the only channel between the two stages.

- **Bottom-row placement is new, simple layout logic in `layouts/default.vue`, not a reuse of `useHighlightLayout.ts`'s callout placement.** Callout placement solves obstacle-avoidance and shelf-stacking around arbitrary highlight positions; a bottom row is just an ordered horizontal list of same-size icons along one edge, with no collision-avoidance problem to solve. Reusing the heavier machinery would add indirection for no benefit.

## Risks / Trade-offs

- [Two different link syntaxes (directive line vs. inline marker) could confuse presenters who don't realize which applies where] → Mitigated by the fact that the two cases are already visually distinct (a `<<<` line always precedes an import; a manual fence never has one), so the "which syntax" question resolves itself from context. Documented explicitly in CLAUDE.md's per-feature reference tables, following the existing style.
- [The local `refs/remotes/origin/HEAD` symref is unset in many real checkouts (any setup other than a plain `git clone`, or an environment that provisions `.git` without carrying that ref file across)] → Mitigated by falling back to `git ls-remote --symref origin HEAD`, which asks the remote directly instead of trusting local state; only if that also fails is the link silently omitted, rather than guessing `main`/`master`.
- [Changing `resolveSnippetSelector`'s return shape touches every caller] → Contained entirely within this package; caller count is small (one production call site in `setup/transformers.ts`, plus its own test suite) and mechanical to update.
