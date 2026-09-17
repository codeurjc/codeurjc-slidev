## 1. Parsing and resolution

- [x] 1.1 `useSlideGeometry.ts`: `ElementEntry`/`ElementKey`, parsing `geometry.elements` (exactly one key, `fit`, rect validation, index-aligned `null`s with warnings) and `withElementRect`
- [x] 1.2 `useSlideGeometry.ts`: pure `resolveGeometryElements(entries, candidates)` — `code:` by import path then fence title (non-imports), `id:` by code wrapper / mermaid host / `<div id>` wrapping exactly one table or import, warnings for no match, several matches, wrong kind, and duplicate claims; `image:` entries win over `geometry.images`
- [x] 1.3 Unit tests for parsing, `withElementRect` and every resolution rule

## 2. Rendering

- [x] 2.1 `setup/transformers.ts`: `<<<` imports carry `{'data-import-path': …}` on their generated fence, forwarded onto `.slidev-code-wrapper` (plain and theme-wrapped fences)
- [x] 2.2 `layouts/default.vue`: collect candidates, resolve, position (`geometry-element`, natural size, contain scale capped at 1 for code/tables, uncapped for mermaid, centred; `fit: none`), clear stale positioning, route `image:` entries through the image path, and recompute callouts on changes
- [x] 2.3 Warnings once per slide via the existing geometry warning helper, including the quoting hint for unmatched `id:` entries

## 3. Editor

- [x] 3.1 `default.vue`: overlays for element entries (`geometry:<no>:element:<n>`, labels by kind and key, aspect lock for images and mermaid only) and write-back with `withElementRect` on the settle debounce
- [x] 3.2 Shared editor state + `_override/SideEditor.vue`: element list entries and the "needs an id" hint for unkeyed code blocks, diagrams and tables

## 4. E2e

- [x] 4.1 New isolated spec `tests/geometry-elements.spec.ts`: two imports side by side by path; a fence by title; mermaid by `{id: 'flow'}`; a table in `<div id>`; contain scale-down and no scale-up; `fit: none`; repeated title and wrong-kind id stay in flow with a warning; an `image:` entry; a code callout still points at its highlight on a scaled block; dragging an element overlay writes `elements` and keeps key and fit; the unkeyed hint in the Layout tab

## 5. ODP importer

- [x] 5.1 `grid.ts`: pure `layoutDraft` over the final draft (side-by-side detection over code blocks, the body and images with `DraftImage.odpRect`; columns and stacking); `draft.ts` renders grids with `grid-cols-[aFr_bFr]` from rounded widths; `convert.ts` leaves grid images out of `geometry.images`, drops `geometry.content` when the body is in a grid, and computes image references in rendered order
- [x] 5.2 Build-ups: no `buildups.ts` change, since the grid is computed after merging; a merged run revealing an image beside code keeps its `<img v-click>` inside the grid column
- [x] 5.3 Tests: synthetic ODPs for code+code, code+image (no `geometry.images` entry), code+text, and code above text (no grid); corpus expectations for Tema 1.2 ODP 34/107 and 2.2 ODP 44/108; smoke-build a generated project with a grid slide

## 6. Docs and checks

- [x] 6.1 `AGENTS.md` (Slide geometry: elements, keys, fit, editor; ODP import: grids) and `tutorial.md` (a slide positioning two code blocks and a mermaid diagram)
- [x] 6.2 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` pass; ODP corpus tests pass locally
