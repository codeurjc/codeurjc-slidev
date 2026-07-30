## MODIFIED Requirements

### Requirement: Anchor and directive preview in slides.md
For `[!mark:...]` anchor-declaration lines and `[!source ...]` directive lines following a `<<<` snippet import, the extension SHALL show a hover with the resolved outcome (target file, resolved line(s), comment, or resolved/overridden source URL), reusing `parseExternalHighlightAnchors`, `resolveSnippetSelector`, and the source-directive parsing already exposed by `codeurjc-slidev-theme`'s composables. For auto mode (implicit or explicit `[!source]`/`[!source bottom]`), the shown URL SHALL be the actual resolved URL (via the theme's `buildGithubSourceLink`), not a placeholder string -- if no URL resolves, the hover SHALL instead say so.

#### Scenario: Hover over a content anchor
- **WHEN** the cursor hovers a `[!mark:"text"]` anchor line following a `<<<` import
- **THEN** a hover is shown containing the resolved target file, the matched line number, and the anchor's comment

#### Scenario: Hover over an explicit source-URL override
- **WHEN** the cursor hovers a `[!source https://...]` directive line
- **THEN** a hover shows that literal URL

#### Scenario: Hover over an auto-detected source directive shows the real URL
- **WHEN** the cursor hovers a `[!source]` (or implicit, no-directive) auto-mode import whose source link resolves
- **THEN** a hover shows the actual resolved URL, not a placeholder string

#### Scenario: Hover over a suppressed source directive
- **WHEN** the cursor hovers a `[!source none]` directive line
- **THEN** a hover shows that the source link is suppressed for this block

## ADDED Requirements

### Requirement: CodeLens actions on a `<<<` import line
A `<<<` import line SHALL show a CodeLens offering "Open imported file" (opens the resolved target file, revealing the resolved selector's line range when the import has one) and, whenever a source-link URL actually resolves, "Open source ↗" (opens that URL). "Open source ↗" SHALL be shown for an explicit `[!source <url>]` override without needing any git resolution, and for auto mode (implicit or `[!source]`/`[!source bottom]`) whenever resolution succeeds; it SHALL NOT be shown for `[!source none]`, nor for auto mode when no URL resolves (a bare missing repo or non-GitHub remote, which stays silent, consistent with the theme's own degrade behavior -- a resolvable-but-branchless case continues to be reported only as a diagnostic, not as a lens).

#### Scenario: Open imported file with a selector
- **WHEN** a `<<<` import has a resolved selector (line range or content-anchor range)
- **THEN** its CodeLens's "Open imported file" action opens the target file with the resolved line range revealed/selected

#### Scenario: Open imported file with no selector
- **WHEN** a `<<<` import has no selector (whole file)
- **THEN** its CodeLens's "Open imported file" action opens the target file with no specific selection

#### Scenario: Open source for an explicit URL override
- **WHEN** a `<<<` import has an explicit `[!source https://...]` directive
- **THEN** its CodeLens shows "Open source ↗", opening that literal URL

#### Scenario: Open source for a resolved auto-detected link
- **WHEN** a `<<<` import is in auto mode and its source link resolves successfully
- **THEN** its CodeLens shows "Open source ↗", opening the resolved URL

#### Scenario: No "Open source" lens when suppressed
- **WHEN** a `<<<` import has a `[!source none]` directive
- **THEN** its CodeLens shows only "Open imported file", with no "Open source" action

#### Scenario: No "Open source" lens when nothing resolves silently
- **WHEN** a `<<<` import is in auto mode and its target file has no enclosing git repo, or a non-GitHub remote
- **THEN** its CodeLens shows only "Open imported file", with no "Open source" action and no diagnostic
