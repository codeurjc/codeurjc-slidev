## Purpose

TBD - defines how a `<<<` snippet import (or a hand-typed code block) gets a clickable link back to its source on GitHub — auto-resolved from the imported file's git repo when possible, overridable or suppressible via a directive line, and rendered beside the title or in a slide-bottom row.

## Requirements

### Requirement: Imported snippets auto-resolve a GitHub source link
When a `<<<`-imported file's nearest enclosing git repository has an `origin` remote pointing at `github.com`, the rendered code block SHALL get a source link to that file on GitHub, deep-linked to the shown line range, without any authoring in `slides.md`. The link target SHALL be `https://github.com/<owner>/<repo>/blob/<branch>/<path-in-repo>#L<start>-L<end>`, where `<path-in-repo>` is the imported file's path relative to that repo's root (not necessarily the same as the configured code root), and `<start>`/`<end>` are the actual matched line numbers of the shown selection (the whole file's first/last line when no selector is given).

#### Scenario: Line-range import gets a deep link
- **WHEN** a slide contains `<<< @/code/ejer8/.../GestorNotas.java[9-15] java`, and that file's repo has a GitHub `origin` remote
- **THEN** the rendered code block's source link points at `.../GestorNotas.java#L9-L15` on the resolved branch

#### Scenario: Content-anchor import gets a deep link to the resolved lines
- **WHEN** a slide contains `<<< @/code/.../GestorNotas.java["public float calculaNotaMedia".."return suma / notas.size();"] java`
- **THEN** the source link's line-range fragment matches the actual line numbers the anchors resolved to, not the anchor text itself

#### Scenario: Whole-file import gets a link to the whole file
- **WHEN** a slide contains `<<< @/code/.../GestorNotas.java java` with no selector
- **THEN** the source link points at the file with no line-range fragment restricting it below the file's full extent

#### Scenario: No origin remote, or a non-GitHub remote, produces no link
- **WHEN** an imported file's repo has no `origin` remote, or an `origin` remote not on `github.com`
- **THEN** no source link is rendered for that import, and no warning is emitted

### Requirement: The linked branch is configurable, else auto-detected
The linked branch SHALL be a configured value when set; otherwise it SHALL be resolved from the repo's actual default branch, tried in order: the local `refs/remotes/origin/HEAD` symref, then (if that is unset) asking the remote directly via `git ls-remote --symref origin HEAD`. If neither the configured value nor either auto-detection source is available, no source link is rendered.

#### Scenario: Configured branch overrides auto-detection
- **WHEN** a branch is explicitly configured
- **THEN** every auto-resolved source link uses that branch, regardless of the repo's actual default branch

#### Scenario: Default branch is auto-detected from the local symref when unconfigured
- **WHEN** no branch is configured and the repo has `refs/remotes/origin/HEAD` set locally
- **THEN** the auto-resolved source link uses that resolved default branch (e.g. `main` or `master`, whichever the remote actually reports)

#### Scenario: Default branch falls back to asking the remote when the local symref is unset
- **WHEN** no branch is configured and the repo's local `refs/remotes/origin/HEAD` symref is not set (e.g. the repo wasn't set up via a plain `git clone`)
- **THEN** the auto-resolved source link uses the default branch reported by `git ls-remote --symref origin HEAD` against the `origin` remote

#### Scenario: Unresolvable branch produces no link
- **WHEN** no branch is configured, `refs/remotes/origin/HEAD` is not set locally, and `git ls-remote --symref origin HEAD` also fails to resolve a default branch (e.g. no network access)
- **THEN** no source link is rendered, and no warning is emitted

### Requirement: A directive line overrides or suppresses an import's source link
A `<<<` import line SHALL accept a following `[!source ...]` directive line (in the same position as `[!mark:...]` anchor-declaration lines) to override the auto-resolved link's URL, suppress it, or force bottom-row placement.

#### Scenario: Explicit URL overrides auto-detection
- **WHEN** a `<<<` import is immediately followed by `[!source https://example.com/custom]`
- **THEN** the rendered code block's source link points at that URL instead of any auto-resolved GitHub link

#### Scenario: none suppresses the link
- **WHEN** a `<<<` import is immediately followed by `[!source none]`
- **THEN** no source link is rendered for that import, even if auto-detection would otherwise have found one

#### Scenario: bottom forces bottom-row placement
- **WHEN** a `<<<` import has a visible title and is immediately followed by `[!source bottom]`
- **THEN** the source link renders in the slide's bottom row instead of beside the title

### Requirement: A hand-typed code block can carry a manual source link
A fenced code block with no backing `<<<` import SHALL accept an inline `// [!source <url>]` (or `#`-comment equivalent) marker line, written as its own line inside the fence, to attach a source link. This marker SHALL be stripped from the rendered code, same as `[!mark]` markers.

#### Scenario: Inline marker attaches a link to a manual code block
- **WHEN** a hand-typed fenced code block contains a line `// [!source https://github.com/owner/repo/blob/main/File.java]`
- **THEN** the rendered code block shows a source link to that URL, and the marker line itself does not appear in the rendered code

#### Scenario: No marker means no link
- **WHEN** a hand-typed fenced code block contains no `[!source ...]` marker
- **THEN** no source link is rendered for that block

### Requirement: Source link renders beside the title, or in a bottom row otherwise
When a code block has a visible title and no `bottom` override, its source link SHALL render as a small clickable icon beside the title text. When a code block has no visible title (`notitle`, or a manual fence with no `[title]`), or `[!source bottom]` was set, its source link SHALL instead render as an icon in a row along the bottom of the slide. Multiple bottom-placed blocks on the same slide SHALL each get their own icon in that row, with the source file or URL shown as a hover tooltip; no connector line is drawn back to the originating block.

#### Scenario: Titled import shows the icon beside its title
- **WHEN** a `<<<` import has a visible title and an auto-resolved or directive-supplied source link
- **THEN** a clickable icon appears beside the title text, linking to that URL

#### Scenario: notitle import shows the icon in the bottom row
- **WHEN** a `<<<` import uses `notitle` and has a source link
- **THEN** the icon appears in the slide's bottom row instead of beside any title

#### Scenario: Multiple untitled blocks on one slide each get a bottom-row icon
- **WHEN** a slide contains two `notitle` imports, each with a resolved source link
- **THEN** the bottom row shows two icons, each linking to its own block's source, distinguished by a hover tooltip
