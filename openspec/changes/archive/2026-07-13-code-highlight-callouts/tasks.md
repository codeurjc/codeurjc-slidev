## 1. Marker parsing & Shiki transformer

- [x] 1.1 Define the marker grammar (single-line `[!mark:<id>]`, range `[!mark:<id>:start]`/`[!mark:<id>:end]`, substring `[!mark:<id>(<substring>)]`) and comment-text extraction rules
- [x] 1.2 Implement a Shiki transformer that scans tokenized line content for the marker comment, strips it from rendered output, and records each highlight's id, kind (line/range/substring), matched text/range, and comment
- [x] 1.3 Wrap matched lines/substrings in `<span data-highlight-id="...">` without breaking existing syntax-highlighting token spans
- [x] 1.4 Register the transformer in `vite.config.ts` (and `e2e/vite.config.ts`, kept in sync per project convention) alongside Slidev's existing Shiki setup
- [x] 1.5 Handle duplicate/malformed marker ids gracefully (first occurrence wins; no thrown errors during build)

## 2. Highlight visual style

- [x] 2.1 Add CSS for the persistent highlight style (background/emphasis), scoped so it doesn't clash with Slidev's native `{n-m}` click-dim styling
- [x] 2.2 Verify highlight style renders correctly across line, range, and substring highlight kinds

## 3. Generalize `useEditor.ts` to dynamic keys

- [x] 3.1 Change `positions`, `hidden`, and `aspectLocked` records from a fixed key union to a dynamic string-keyed record, preserving existing behavior for `red-bar`, `logo`, `title`, `content`, `image`
- [x] 3.2 Ensure undo/snapshot logic captures and restores dynamic keys the same way it does fixed keys
- [x] 3.3 Ensure dynamic keys default to no lock/hide UI without errors (SideEditor element list only lists fixed elements + any dynamic ones that opt in)
- [x] 3.4 Update/extend `composables/__tests__/` unit tests to cover dynamic-key add/remove/undo/persist behavior

## 4. Callout data model & auto-placement

- [x] 4.1 New composable to compute each highlight span's bounding rect relative to its code block and the slide
- [x] 4.2 New composable implementing ordered candidate placement (right → left → below → above, first non-colliding against code block + other callouts) with a stacking fallback when no candidate is collision-free
- [x] 4.3 New composable computing the 2–3 segment elbow path between a callout box and its highlight's anchor point, guaranteed not to cross the code block's bounding box except at the anchor

## 5. Callout rendering in `layouts/default.vue`

- [x] 5.1 Render one callout box per highlight-with-comment, positioned per auto-placement (or override, see 6.x)
- [x] 5.2 Render the elbow connector as an SVG/CSS overlay from callout box to highlight anchor
- [x] 5.3 Skip callout/connector rendering for highlights with no comment text (highlight style still applies)
- [x] 5.4 Verify multiple callouts on one slide/code block render without overlapping each other

## 6. Editor drag/persist for callouts

- [x] 6.1 Wire callout boxes into the existing drag start/move/end handlers via their dynamic key (`callout:<highlight-id>`)
- [x] 6.2 Recompute the elbow connector live during drag
- [x] 6.3 Persist overridden callout positions via a dedicated `/api/save-code-highlight-position` endpoint that rewrites the marker's `@x,y` suffix in `slides.md` (callouts are per-slide/per-highlight, not per-layout, so the existing `/api/save-layout` payload shape wasn't the right fit -- see design.md)
- [x] 6.4 Restore overridden callout positions on mount, taking precedence over auto-placement for that highlight id
- [x] 6.5 Update `e2e/vite.config.ts` to match any `/api/save-layout` middleware or `VAR_MAP` changes

## 7. Tests

- [x] 7.1 Unit tests for marker parsing (line/range/substring, malformed input, duplicate ids)
- [x] 7.2 Unit tests for auto-placement candidate selection and collision avoidance
- [x] 7.3 Unit tests for elbow path computation
- [x] 7.4 E2e test: marking a highlight with a comment renders a callout connected to the correct fragment
- [x] 7.5 E2e test: dragging a callout in editor mode persists across reload
- [x] 7.6 E2e test: multiple highlights in one code block each get a non-overlapping callout
- [x] 7.7 Run `pnpm test && pnpm test:e2e` and fix any regressions in existing suites caused by the `useEditor.ts` generalization

## 8. Documentation

- [x] 8.1 Document the marker syntax (single-line, range, substring) and callout-dragging workflow in `CLAUDE.md` or a dedicated docs section, with a `slides.md` example
