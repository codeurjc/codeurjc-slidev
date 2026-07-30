## Purpose

TBD - defines a workspace-wide index, built by the VSCode extension, mapping every `<<<` import's resolved anchor highlights across all theme-tagged markdown files to their absolute target file and line, kept current as either side edits, and surfaced back to the target file as a CodeLens so opening example code under `code/` shows which slides reference which lines.

## Requirements

### Requirement: Workspace-wide anchor index
The extension SHALL build an index, across every theme-tagged markdown file in the open workspace, mapping each `<<<` import's resolved anchor highlights to their absolute target file and line, by combining `resolveSnippetSelector`'s reported slice line numbers with `parseExternalHighlightAnchors`'s slice-relative highlight positions. The index SHALL be keyed by target file absolute path, with one entry per reference (originating slide file, originating anchor line, comment).

#### Scenario: Single reference indexed
- **WHEN** a workspace contains one theme-tagged `slides.md` with a `<<<` import and one `[!mark:"text"]` anchor that resolves
- **THEN** the index contains one entry for the target file pointing back to that slide file and anchor line

#### Scenario: Multiple slides reference the same target line
- **WHEN** two different theme-tagged markdown files each have an anchor resolving to the same line of the same target file
- **THEN** the index's entry for that target file/line lists both originating references

### Requirement: Index kept current on edits
The extension SHALL re-resolve the affected portion of the index when either a theme-tagged markdown file or a file it targets via `<<<`/anchors changes: editing a markdown file re-resolves only that file's contributions; editing a target file re-resolves anchors against that file's current content (mirroring the theme's own dev-server behavior, which re-resolves on every render rather than caching stale line numbers).

#### Scenario: Editing the slide file updates its own references
- **WHEN** an anchor line in an open theme-tagged markdown file is changed
- **THEN** the index entries contributed by that file are recomputed without rescanning other markdown files

#### Scenario: Editing the target file re-resolves against current content
- **WHEN** a target file referenced by an anchor is edited
- **THEN** subsequent index lookups for that target file re-run selector/anchor resolution against the file's current text rather than returning stale line numbers

### Requirement: CodeLens on referenced target lines
When a file present in the index is opened directly, the extension SHALL show a CodeLens above each referenced line summarizing the reference count and originating slide(s) (e.g. "📽 2 references — Slide 3, Slide 12"), with a command that navigates to the corresponding anchor line in the originating markdown file.

#### Scenario: Single reference CodeLens
- **WHEN** a target file with one indexed reference to one of its lines is opened
- **THEN** a CodeLens appears above that line identifying the referencing slide

#### Scenario: CodeLens navigation
- **WHEN** the user activates a reference-index CodeLens
- **THEN** the corresponding markdown file opens (or is focused) with the cursor placed at the originating anchor line

#### Scenario: Unreferenced file has no CodeLens
- **WHEN** a file under the code root has no indexed references
- **THEN** no reference-index CodeLens is shown for that file
