# content-text-autofit

## Purpose

TBD - defines how the default layout's `content` element automatically adjusts its font size to fit rendered content within the fixed `content` box's bottom edge, without ever modifying the box's own geometry.

## Requirements

### Requirement: Content text defaults to a 24px font size when it fits
Content text SHALL render at a default font size of 24px whenever the rendered content fits within the fixed `content` box's bottom edge without shrinking. This is both the default and the ceiling — font size SHALL NOT grow past 24px under any circumstance, even when the box has more slack than needed.

#### Scenario: Short content renders at the default size
- **WHEN** a slide's content, rendered at 24px, does not overflow the `content` box's bottom edge
- **THEN** the content renders at 24px

#### Scenario: Font size never exceeds 24px
- **WHEN** a slide's content is very short (e.g. a single short line) and the `content` box has significant unused vertical space
- **THEN** the content still renders at exactly 24px, not larger

### Requirement: Font size shrinks to keep content within the box's bottom edge
When content rendered at the current font size would overflow the bottom edge of the fixed `content` box, the font size SHALL shrink (via real `font-size` reduction that causes text to reflow/rewrap, not a visual scale transform) until the content fits, down to a floor of 12px. The `content` box's own geometry (position and size, as configured via the layout editor) SHALL NOT be modified by this process under any circumstance.

#### Scenario: Overflowing content shrinks to fit
- **WHEN** a slide's content, rendered at 24px, would overflow the `content` box's bottom edge
- **THEN** the font size decreases until the content's rendered height no longer overflows the box, or until 12px is reached

#### Scenario: Box geometry is never altered
- **WHEN** content is shrunk or grown by this feature at any point
- **THEN** the `content` box's configured `x`, `y`, `width`, and `height` remain exactly as set by the layout editor

### Requirement: Font size grows back toward the 24px default when slack allows
When content shrinks below 24px and a subsequent change (e.g. a `v-click` step back to an earlier, shorter reveal state, or edited content) means the content would now fit at a larger size, the font size SHALL grow back up, up to the 24px ceiling, rather than remaining permanently at whatever size it previously shrank to.

#### Scenario: Reverting to less content grows the font size back
- **WHEN** content that had shrunk below 24px to fit is replaced or reduced such that it would now fit at a larger size (up to 24px)
- **THEN** the font size increases accordingly, up to but not exceeding 24px

### Requirement: Font size floor is 12px; overflow beyond the floor remains visible
Font size SHALL NOT shrink below 12px. If content still overflows the `content` box's bottom edge at 12px, that overflow SHALL remain visible (not clipped, and not shrunk further), serving as a visible signal that the box is too small for its content.

#### Scenario: Content too large even at the floor
- **WHEN** a slide's content would still overflow the `content` box's bottom edge even when rendered at 12px
- **THEN** the font size stops shrinking at 12px and the overflowing content remains visible below the box rather than being clipped or further shrunk

### Requirement: Font size recomputes live across v-click step changes
Because the `content` box's fixed geometry is treated as an immutable constraint (not something this feature adjusts), and Slidev's `v-click` directive changes the rendered content's height at each presentation step without a navigation event, the font-size fit SHALL be recomputed on every `v-click` step change (both advancing and reversing), reflecting whatever content is visible at that step.

#### Scenario: Advancing a v-click step that adds overflowing content
- **WHEN** the presenter advances to a `v-click` step that reveals additional content, causing the content to now overflow the box at the current font size
- **THEN** the font size shrinks (down to the 12px floor if necessary) to keep the newly-visible content within the box

#### Scenario: Reversing a v-click step removes the need to shrink
- **WHEN** the presenter moves back to an earlier `v-click` step with less revealed content
- **THEN** the font size grows back up (up to the 24px ceiling) to reflect the reduced content at that step

### Requirement: Horizontal overflow is handled by wrapping, not font-size shrinking
This feature governs vertical fit only. Content that is too wide for the `content` box's width (e.g. long unwrapped code lines) SHALL be handled by wrapping to the next line rather than triggering a font-size reduction.

#### Scenario: A long line wraps instead of shrinking the font
- **WHEN** a line of content (e.g. a long code line) exceeds the `content` box's width at the current font size
- **THEN** the line wraps to the next line, and the font size is not reduced on account of horizontal overflow alone
