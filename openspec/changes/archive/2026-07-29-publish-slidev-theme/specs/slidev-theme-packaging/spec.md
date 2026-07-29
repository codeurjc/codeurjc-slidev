## ADDED Requirements

### Requirement: Installable theme package
The reusable presentation system (layouts, layout editor, code-highlight callouts, code-snippet import, slide title carry-over, UnoCSS shortcuts) SHALL be published as an npm package named `codeurjc-slidev-theme` that any Slidev project can add as a dependency and select via `theme: codeurjc-slidev-theme` in its `slides.md` frontmatter.

#### Scenario: Consumer selects the theme
- **WHEN** a Slidev project's `package.json` depends on `codeurjc-slidev-theme` and its `slides.md` frontmatter includes `theme: codeurjc-slidev-theme`
- **THEN** `pnpm dev`/`slidev build` resolves layouts, setup transformers, and Vite plugin behavior from the theme package without any theme-specific configuration elsewhere in the consumer project

### Requirement: No consumer-authored Vite config required
A consumer project SHALL NOT need its own `vite.config.ts` to get the theme's editor middlewares, markdown transformers, or UnoCSS shortcuts — these SHALL be supplied entirely by the theme package and picked up automatically by Slidev's own root-resolution.

#### Scenario: Consumer repo has no vite.config.ts
- **WHEN** a consumer repo contains only `package.json`, `slides.md`, and `code/`, with `codeurjc-slidev-theme` as a dependency
- **THEN** the drag/resize layout editor, code-highlight callout rendering, and `<<<` snippet-import all function identically to how they function in this repo today

### Requirement: Implicit default layout preserved
Slides that omit a `layout:` field SHALL continue to render using the theme's default layout (draggable overlays, code-highlight callouts), matching Slidev's built-in "no `layout:` → use `default`" fallback, with no per-slide `layout:` annotation required.

#### Scenario: Slide with no layout field
- **WHEN** a slide in a consumer's `slides.md` has no `layout:` field in its frontmatter
- **THEN** it renders with the theme's `default` layout, exactly as an equivalent slide does in this repo's own `slides.md` today

### Requirement: Consumer-owned files are resolved against the consumer's project root
The theme's Vite plugin middlewares that read or write consumer content (`layouts/*.vue` for the layout editor's save function, `slides.md` for the code-highlight-callout drag-to-reposition save function) SHALL resolve those paths against the consuming project's root directory, not the theme package's own installed location.

#### Scenario: Saving a dragged layout element from an installed theme
- **WHEN** a presenter drags a layout element in the editor of a consumer project that has `codeurjc-slidev-theme` installed as an npm dependency (not cloned in place)
- **THEN** the resulting layout `.vue` file is written into the consumer project's own `layouts/` directory, not into the theme package's installed directory inside `node_modules`

#### Scenario: Saving a dragged code-highlight callout from an installed theme
- **WHEN** a presenter drags a code-highlight callout in a consumer project that has `codeurjc-slidev-theme` installed as an npm dependency
- **THEN** the `@x,y` position override is written into the consumer project's own `slides.md`, not into any file inside the theme package's installed directory

### Requirement: Consumer layout override precedence
A consumer project MAY provide its own `layouts/<name>.vue` file with the same name as a theme-provided layout; when present, the consumer's own file SHALL take precedence over the theme's version, without requiring any change to the theme package.

#### Scenario: Consumer overrides the default layout
- **WHEN** a consumer project defines its own `layouts/default.vue`
- **THEN** that file is used instead of the theme's shipped `layouts/default.vue`, using Slidev's own layout-resolution precedence rather than custom fallback logic in the theme
