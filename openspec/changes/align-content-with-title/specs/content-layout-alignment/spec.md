## ADDED Requirements

### Requirement: Content position is fully determined by its own CSS custom properties, unaffected by ancestor padding
The default layout's `content` element SHALL remain `position: static` (normal flow, so that the `title` heading nested inside it via `<slot />` keeps escaping to `root` as its containing block), with `margin-left`/`margin-top` driven directly by `--ed-content-x`/`--ed-content-y` and no additional inherited padding contributing to its position, on either axis. The `.slidev-layout.default` root SHALL override all of Slidev's inherited base padding (both horizontal and vertical) so none of it leaks into `.content`'s effective offset, and SHALL establish a block-formatting context (e.g. `display: flow-root`) so that zeroing the padding cannot cause `.content`'s `margin-top` to collapse through `root`. The default value of `--ed-content-x` SHALL be `0px` (the true slide left edge); `--ed-content-x` remains fully editable via the layout editor like every other element's position, so a slide author can align it with the title (`x=24px`) or elsewhere on a per-slide basis.

#### Scenario: Default content sits at the true slide left edge
- **WHEN** the default layout renders with no custom position overrides
- **THEN** the rendered left edge of the `content` box is at `x = 0px`, unaffected by any ancestor padding

#### Scenario: Content's vertical position matches its CSS custom property with no ancestor-padding leakage
- **WHEN** the default layout renders with no custom position overrides
- **THEN** the rendered top edge of the `content` box is at `y = 80px` (its `--ed-content-y` default), not pushed further down by Slidev's inherited top padding

#### Scenario: Zeroing root's padding does not cause margin-collapse
- **WHEN** the default layout renders with `.slidev-layout.default`'s padding fully zeroed
- **THEN** `.content`'s `margin-top` does not collapse through `root` (i.e. `.content` does not render at `y = 0`), because `root` establishes its own block-formatting context

#### Scenario: Content position is fully determined by its CSS custom properties
- **WHEN** `--ed-content-x` or `--ed-content-y` is changed (via the editor or a saved layout)
- **THEN** the rendered `content` box position changes by exactly that amount, with no hidden offset contributed by ancestor padding or the element's own padding

### Requirement: Content default width extends to the logo's left edge
The default layout's `content` element SHALL default to a width that extends its right edge to meet the logo's default left edge, rather than leaving a margin against the slide's right edge or being sized against a since-removed left-inset artifact. `content` SHALL have no internal margin or padding beyond what positions it — its box bounds are the sole determinant of the visible text area.

#### Scenario: Default content width against the default logo position
- **WHEN** the default layout renders with no custom position overrides
- **THEN** `content`'s right edge (`x + width`) equals the logo's default left edge (`980(slide) - 24(--ed-logo-rx) - 80(--ed-logo-w) = 876`, giving `width = 876px` given `x = 0px`)

#### Scenario: Content has no internal padding
- **WHEN** the default layout renders with no custom position overrides
- **THEN** `content`'s rendered text area extends fully to all four edges of its box, with no padding narrowing it

### Requirement: Content overlay mirrors the real content box exactly
In edit mode, the `content-overlay` drag box (`position: absolute`, driven by the same `--ed-content-x`/`-y`/`-w` custom properties) SHALL compute the same left/top/width as the real `content` element renders at, so the overlay's screen position always matches where content actually renders.

#### Scenario: Dragging content in the editor matches the rendered result
- **WHEN** a user drags or resizes the `content` element via its overlay in the layout editor
- **THEN** the real rendered `content` box moves/resizes to exactly the position/size shown by the overlay, with no discrepancy between edit-mode preview and actual render

#### Scenario: Content overlay position with no ancestor-padding leakage
- **WHEN** the layout editor is open and the `content` element is unmodified from defaults
- **THEN** the `content-overlay`'s rendered left edge equals the real `content` box's rendered left edge (both at `x = 0px`), and its rendered top edge equals the real `content` box's rendered top edge (both at `y = 80px`), not offset by Slidev's inherited base padding on either axis
