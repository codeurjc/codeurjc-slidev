## Context

Slidev renders fenced code blocks through Shiki. It already supports a line-range syntax (`` ```java {6-8} ``) but that only dims/undims whole lines across click steps — there is no persistent sub-line emphasis and no way to attach explanatory text to a highlight. This repo also already has a working pattern for "draggable, persisted visual elements on top of slide content": `composables/useEditor.ts` + `layouts/default.vue`, currently used for a *fixed* set of five named elements (`red-bar`, `logo`, `title`, `content`, `image`), each with a single position/size and optional aspect-lock, saved via the `/api/save-layout` Vite middleware into `data-styles`/`data-hidden`/`data-aspect-locked` attributes on the slide root.

This change extends that pattern to an open-ended, per-slide, per-highlight collection of callout boxes, each connected to a marked code fragment (line, line-range, or substring) by an elbow-style connector.

## Goals / Non-Goals

**Goals:**
- Let a presenter mark one or more fragments (line, line-range, or substring) inside a fenced code block via inline markdown syntax, each with an attached comment.
- Render each marked fragment with a persistent highlight style (not a click-driven dim/undim).
- Render one callout box per highlight, auto-placed to avoid overlapping the code block and other callouts, connected by an elbow (axis-aligned) line.
- Allow dragging a callout box in editor mode to override its auto-placed position, and persist that override back to the slide source, reusing the existing save-layout mechanism's shape as closely as possible.
- Support multiple highlight+callout pairs per code block, and multiple code blocks per slide.

**Non-Goals:**
- Replacing or reimplementing Slidev's native `{n-m}` click-step line dim/undim behavior — the two can coexist but this feature does not touch that syntax.
- Freeform/bezier connector lines (elbow only, per decision).
- Cross-slide callout linking or animation sequencing between callouts.
- A fully general collision-avoidance/constraint solver — a straightforward ordered-candidate placement (right → left → below → above, first non-colliding) is sufficient.

## Decisions

### Markdown syntax: inline trailing marker comments
Highlights are declared with a trailing marker comment on the target line, following the existing Shiki `// [!code ...]`-style convention presenters may already be familiar with:

```java
public GestorNotas(DBAlumno alumnos) { // [!mark:ctor-dep] Injects the DB dependency
  this.alumnos = alumnos;
}
```

- The id (`ctor-dep`) is a presenter-chosen slug, not an auto-incrementing number, so inserting/reordering highlights doesn't renumber unrelated marks.
- The text after the id is the callout's comment body.
- Sub-line (substring) highlighting adds a parenthesized match target before the comment: `// [!mark:ctor-dep(this.alumnos)] Injects the DB dependency` highlights only that substring on the line rather than the whole line.
- Multi-line ranges use a start/end pair sharing the same id: `// [!mark:ctor-dep:start]` / `// [!mark:ctor-dep:end]`.

**Alternatives considered:** a centralized fence-attribute block (all marks + notes declared in the code fence's info string) was rejected because it forces the presenter to track line numbers by hand, which silently desyncs the moment the code above is edited — the inline marker stays correct because it moves with its line.

### Rendering: Shiki transformer, not markdown-it preprocessing
A Shiki transformer (registered alongside Slidev's existing highlighter setup) recognizes the trailing marker comment, strips it from displayed output, and wraps the matched line/substring in a `<span data-highlight-id="ctor-dep">`. This runs after Shiki's own tokenization so existing syntax-highlighting spans are preserved and the mark spans nest around/within them without disrupting token boundaries.

**Alternative considered:** a markdown-it preprocessing step operating on raw fence content before Shiki sees it. Rejected because matching a substring inside already-tokenized, syntax-highlighted HTML is what a Shiki transformer is designed for; doing it pre-tokenization would require re-deriving token boundaries after the fact.

### Position model: generalize `useEditor.ts` to dynamic keys
`useEditor.ts`'s `positions`/`hidden`/`aspectLocked` records currently have a fixed, hardcoded key set. This change generalizes them to accept arbitrary string keys, so a callout's key is its highlight id (e.g. `callout:ctor-dep`), scoped per-slide. The five existing fixed elements keep working unchanged since they're just entries in the same now-dynamic record. Aspect-lock and hide are not exposed in the UI for callout entries (non-goal), but the underlying record doesn't need to special-case that — it simply isn't toggled for these keys.

**Alternative considered:** a fully separate, parallel store just for callouts (no shared code with `useEditor.ts`). Rejected because callouts need the same drag/persist/undo primitives the existing store already provides, and maintaining two parallel drag-and-save implementations would double the surface area for bugs like the ones documented in `layout-editor-resize`'s spec (aspect-lock ratio capture, right-anchored resize, etc.) without callouts actually needing anything those don't already generalize to.

### Placement: ordered candidate + collision check, elbow connector
For each highlight, compute its rendered bounding rect (from the transformer's `<span>`), then try candidate zones in order — right of code block, left, below, above — picking the first whose bounding box doesn't overlap the code block or any already-placed callout for that slide. The elbow connector is a 2-segment path: horizontal from the highlight's edge to a rail x (or y, for above/below placements), then a perpendicular segment into the callout box's nearest edge. This keeps routing cheap (no pathfinding) while still avoiding the code text, since the rail sits outside the code block's bounding box by construction.

Dragging a callout box in editor mode overrides its computed position (stored the same way image/title positions are: CSS custom properties on the slide root, restored on mount) and disables auto-placement for that highlight id until the presenter resets it.

### Highlight visual style
Marked fragments get a background-tint + rounded-corner treatment distinct from Slidev's native click-dim styling, so the two mechanisms don't visually collide if a code block happens to use both.

## Risks / Trade-offs

- **[Risk]** Elbow routing with many highlights on one crowded code block may run out of non-colliding candidate zones → **Mitigation**: fall back to stacking multiple callouts in the same zone (as sketched in the exploration), accepting a longer connector rather than a collision; presenter can always drag-override.
- **[Risk]** Substring matching (`(this.alumnos)`) could match the wrong occurrence if the target string appears multiple times on the line → **Mitigation**: match is scoped to the marked line only, and resolves to the first occurrence; presenter can disambiguate by widening the match string.
- **[Risk]** Generalizing `useEditor.ts` from fixed to dynamic keys touches code with existing undo/lock/hide behavior relied on by `layout-editor-resize` and `image-position` specs → **Mitigation**: existing five keys keep their current behavior; new dynamic-key support is additive, verified by the existing unit/e2e suites plus new tests for dynamic keys.
- **[Trade-off]** Elbow-only connectors are simpler and collision-safer than freeform bezier tails but read as less "comic box"-like; accepted per explicit user decision.

## Open Questions

- Should there be a UI affordance (SideEditor) to reset a single dragged callout back to auto-placement, or only a global reset/undo?
- What happens when a highlighted code block is scrolled/resized by the layout editor's existing `content` resize — do callouts reflow live, or only recompute on next mount?
