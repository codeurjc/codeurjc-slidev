## Why

Presenters currently have no way to draw attention to a specific fragment of code (a line, part of a line, or a range of lines) and explain *why* it matters directly on the slide. Slidev's native line-range syntax only dims/undims whole lines during clicks — it can't mark a sub-line token, and it has no way to attach an explanatory comment. Presenters end up narrating highlights verbally or adding disconnected bullet text above/below the code block, which breaks the visual link between the explanation and the code it refers to.

## What Changes

- New inline markdown marker syntax inside fenced code blocks to tag a highlight: a line, a line range, or a substring/token within a line, each with a stable id.
- New markdown syntax to attach a comment/note string to a highlight id (the callout's text).
- A Shiki transformer that wraps marked lines/substrings in identifiable `<span>` elements at render time, preserving existing syntax highlighting.
- A rendered highlight visual treatment (background/underline) distinct from Slidev's native `{n-m}` dim/undim behavior — highlights here are static emphasis, not click-step reveals.
- A callout box per highlight, connected to its highlighted fragment by an elbow-style (axis-aligned, two/three-segment) connector line.
- Automatic placement of each callout (left/right/above/below the code block, whichever has room) so callouts avoid overlapping the code block and each other by default.
- Editor-mode dragging to reposition an individual callout box, with the elbow connector recomputed live; the resulting position persists back to the slide (extending the existing layout-editor save mechanism to a dynamic, per-highlight collection rather than the current fixed element set).
- Support for multiple independent highlight+callout pairs within a single code block.

## Capabilities

### New Capabilities
- `code-highlight-marking`: Markdown syntax + Shiki transformer for marking a line, line-range, or substring within a fenced code block with a stable id, and rendering it with a distinct highlight style.
- `code-highlight-callouts`: Rendering of comment callout boxes tied to marked highlights, including auto-placement, elbow connector routing, and collision avoidance between multiple callouts.

### Modified Capabilities
- `layout-editor-resize`: The editor's drag/save mechanism (currently a fixed set of named elements: red-bar, logo, title, content, image) needs to support a dynamic, variable-length collection of elements (one per highlight, per slide) for callout box positions to be draggable and persisted.

## Impact

- `vite.config.ts`: register a Shiki/markdown-it transformer for the new marker syntax; no changes expected to the existing `/api/save-layout` endpoint's core request handling, but its persisted payload shape must grow to include a variable number of callout entries.
- `composables/useEditor.ts`: generalize the fixed `VAR_MAP`/positions model to support dynamically keyed elements (one per highlight id), while preserving existing behavior for the five fixed elements.
- `layouts/default.vue`: new rendering logic for callout boxes and elbow connectors inside `.content`, positioned relative to highlighted code spans.
- New composable(s) for computing highlight span rects, auto-placement, and elbow path geometry.
- `slides.md` and other decks: authors gain new inline syntax inside code fences; existing code blocks are unaffected unless they opt in.
- Unit tests (`composables/__tests__/`) and e2e tests (`tests/`, mirrored in `e2e/`) for the new marking, placement, and drag/persist behavior.
