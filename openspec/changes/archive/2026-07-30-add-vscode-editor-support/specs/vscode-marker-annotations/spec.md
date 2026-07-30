## ADDED Requirements

### Requirement: Theme-scoped activation
The extension SHALL only provide decorations, hovers, and diagnostics for a markdown document whose YAML frontmatter declares `theme: codeurjc-slidev-theme` (directly, or via Slidev's own theme-resolution — at minimum an exact top-level `theme:` match is required). Documents without this frontmatter SHALL be left entirely unannotated.

#### Scenario: Theme-tagged slides.md is annotated
- **WHEN** a markdown file with `theme: codeurjc-slidev-theme` in its frontmatter is opened
- **THEN** the extension parses its content for marker/anchor/directive grammar and renders decorations

#### Scenario: Unrelated markdown is left untouched
- **WHEN** a markdown file with no `theme:` frontmatter field (or a different theme) is opened
- **THEN** the extension renders no decorations, hovers, or diagnostics for that file

### Requirement: Inline marker preview decoration
For a manual fenced code block containing `// [!mark...]` / `# [!mark...]` marker comments, the extension SHALL decorate the buffer to preview what the theme will actually render: the marker syntax itself dimmed (since it is stripped from render), and the highlighted line/range/substring visually marked, reusing `parseCodeHighlights` from `codeurjc-slidev-theme/composables/useCodeHighlights` for parsing.

#### Scenario: Whole-line marker
- **WHEN** a code line ends with `// [!mark] some comment`
- **THEN** the marker comment text is shown dimmed and the code line is decorated as highlighted

#### Scenario: Range marker
- **WHEN** a `// [!mark:start]` ... `// [!mark:end]` pair appears in a fenced block
- **THEN** every line from start through end inclusive is decorated as one highlighted range

#### Scenario: Substring marker
- **WHEN** a marker includes a `(<start>-<end>)` character range
- **THEN** only that character span of the line is decorated, not the whole line

### Requirement: Anchor and directive preview in slides.md
For `[!mark:...]` anchor-declaration lines and `[!source ...]` directive lines following a `<<<` snippet import, the extension SHALL show a hover with the resolved outcome (target file, resolved line(s), comment, or resolved/overridden source URL), reusing `parseExternalHighlightAnchors`, `resolveSnippetSelector`, and the source-directive parsing already exposed by `codeurjc-slidev-theme`'s composables.

#### Scenario: Hover over a content anchor
- **WHEN** the cursor hovers a `[!mark:"text"]` anchor line following a `<<<` import
- **THEN** a hover is shown containing the resolved target file, the matched line number, and the anchor's comment

#### Scenario: Hover over a source directive
- **WHEN** the cursor hovers a `[!source ...]` directive line
- **THEN** a hover shows the URL that will be used (auto-detected, overridden, or "suppressed" for `none`)

### Requirement: Diagnostics for unresolved markers and anchors
The extension SHALL report, as standard VSCode diagnostics anchored to the offending line, every condition the theme's parsing already classifies as a warning or error via the `onWarn`/`onError` hooks on `parseExternalHighlightAnchors` and the warning callback on `resolveSnippetSelector` — including an anchor whose text is not found, an ambiguous anchor with no occurrence selector, and an explicit `#N` past the match count.

#### Scenario: Anchor text not found
- **WHEN** a `[!mark:"text"]` anchor's text does not occur anywhere in the resolved snippet
- **THEN** a warning-severity diagnostic is shown on that anchor line

#### Scenario: Ambiguous anchor without occurrence selector
- **WHEN** a content anchor's text matches more than once and no `#N`/`#*` selector is given
- **THEN** a warning-severity diagnostic notes the ambiguity and that the first match is used

#### Scenario: Out-of-range explicit occurrence
- **WHEN** an anchor specifies `#N` and fewer than `N` matches exist
- **THEN** an error-severity diagnostic is shown on that anchor line
