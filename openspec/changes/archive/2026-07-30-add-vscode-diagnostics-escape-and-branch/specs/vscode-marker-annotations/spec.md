## MODIFIED Requirements

### Requirement: Diagnostics for import, anchor, and source-link resolution problems
The extension SHALL report, as standard VSCode diagnostics anchored to the offending line, every condition the theme's own parsing/resolution already classifies as a warning or error via the `onWarn`/`onError` hooks on `parseExternalHighlightAnchors` and the warning callback on `resolveSnippetSelector` — including an anchor whose text is not found, an ambiguous anchor with no occurrence selector, and an explicit `#N` past the match count — plus two conditions the theme itself only ever logs to the Vite dev-server console: a `<<<` import resolving outside the configured code root, and a source link (implicit or explicit `[!source]` auto mode) that cannot resolve a git branch despite finding a repo and a GitHub `origin` remote.

#### Scenario: Anchor text not found
- **WHEN** a `[!mark:"text"]` anchor's text does not occur anywhere in the resolved snippet
- **THEN** a warning-severity diagnostic is shown on that anchor line

#### Scenario: Ambiguous anchor without occurrence selector
- **WHEN** a content anchor's text matches more than once and no `#N`/`#*` selector is given
- **THEN** a warning-severity diagnostic notes the ambiguity and that the first match is used

#### Scenario: Out-of-range explicit occurrence
- **WHEN** an anchor specifies `#N` and fewer than `N` matches exist
- **THEN** an error-severity diagnostic is shown on that anchor line

#### Scenario: Import escapes the configured code root
- **WHEN** a `<<<` import's file path resolves outside the configured code root
- **THEN** a warning-severity diagnostic is shown on the import line, and the import is still read and analyzed (the escape is a warning, not a resolution failure)

#### Scenario: Source link cannot resolve a git branch
- **WHEN** a `<<<` import is in `[!source]` auto mode (implicit, with no directive line at all, or an explicit `[!source]`/`[!source bottom]`), and its target file's git repo has a GitHub `origin` remote but neither a `codeSourceLinkBranch` frontmatter override nor a resolvable local/remote default branch
- **THEN** a warning-severity diagnostic is shown on the `[!source]` directive line if one is present, else on the import line

#### Scenario: No diagnostic for a merely absent git repo or non-GitHub remote
- **WHEN** a `<<<` import's target file has no enclosing git repo, or its repo's `origin` remote is not a GitHub remote
- **THEN** no source-link diagnostic is shown, since the theme itself already treats these as intentional, silent "no link" states
