# vscode-geometry-intellisense

## Purpose

Checks per-slide `geometry` frontmatter as the author types, from the document text alone: every problem the theme's own geometry parsing and resolution detect becomes an editor diagnostic on the field that caused it, keys are completed from the slide's real content, and quick fixes write the ids that connect an entry to its element.

## Requirements

### Requirement: Geometry frontmatter is diagnosed as the author types
In a document the extension has activated for (frontmatter declaring `theme: codeurjc-slidev-theme`), the extension SHALL report every problem the theme's own geometry parsing and resolution detects as a VSCode diagnostic on the offending line, without a dev server running. Diagnostics SHALL be produced by the theme's own parsing and resolution functions rather than by reimplemented grammar rules, so the reported conditions and their wording cannot drift from the theme's behaviour.

#### Scenario: A malformed rect
- **WHEN** a slide declares `geometry.content: {x: 31, y: 98, w: 0, h: 424}`
- **THEN** a warning diagnostic reporting that `w` must be greater than 0 is attached to that entry

#### Scenario: A key that matches nothing
- **WHEN** a slide declares `geometry.elements: [{id: flow, …}]` and no element on that slide carries the id `flow`
- **THEN** a warning diagnostic is attached to that entry explaining that it matches nothing and how to make it match

#### Scenario: A key that matches more than one element
- **WHEN** a slide declares `geometry.elements: [{code: dup.ts, …}]` and two fences on that slide are titled `dup.ts`
- **THEN** a warning diagnostic is attached to that entry reporting the ambiguity

#### Scenario: An id of the wrong kind
- **WHEN** a slide declares `geometry.elements: [{id: prices, …}]` and `prices` is the id of an element that is neither a code fence, a mermaid block, nor a `<div>` wrapping only a table or `<<<` import
- **THEN** a warning diagnostic is attached reporting that the id names the wrong kind of element

#### Scenario: Two entries claiming the same target
- **WHEN** two `geometry` entries on one slide resolve to the same element or image
- **THEN** a warning diagnostic is attached to the entry that lost the claim

#### Scenario: No dev server is running
- **WHEN** geometry diagnostics are produced for an open document and no Slidev dev server is running
- **THEN** the diagnostics are produced anyway, from the document text alone

#### Scenario: Valid geometry
- **WHEN** a slide's `geometry` frontmatter is valid and every entry resolves to exactly one target
- **THEN** no geometry diagnostic is reported for that slide

### Requirement: Diagnostics are suppressed where the slide's content cannot be seen statically
A slide whose content is pulled in from another file SHALL NOT receive resolution diagnostics for entries whose targets would live in that other file, because the extension cannot see the content the entry is matched against. Grammar-level diagnostics that depend only on the entry itself SHALL still be reported.

#### Scenario: A slide that includes another file
- **WHEN** a slide's frontmatter declares both `geometry.elements` and a `src:` include of another markdown file
- **THEN** no "matches nothing" diagnostic is reported for those entries

#### Scenario: A malformed entry on an including slide
- **WHEN** that same slide declares an entry with a non-numeric `x`
- **THEN** that grammar-level problem is still diagnosed

### Requirement: Geometry keys are completed from the slide's real content
The extension SHALL offer completions inside a `geometry` entry drawn from the slide the entry belongs to: `code:` from that slide's `<<<` import paths as written and its fence titles, `id:` from the ids actually present on that slide, `src:` and `image:` from that slide's authored image srcs, and `fit:` from the fit values the theme accepts. Image completions SHALL be offered in the shortest unambiguous reference form, matching what the theme's own writers produce.

#### Scenario: Completing a code key
- **WHEN** the cursor sits after `code:` in a `geometry.elements` entry and the slide contains a `<<<` import of `@/code/ejem1/Calculadora.java` and a fence titled `Test.java`
- **THEN** both `@/code/ejem1/Calculadora.java` and `Test.java` are offered

#### Scenario: Completing an id key
- **WHEN** the cursor sits after `id:` and the slide has a mermaid fence tagged `{id: 'flow'}`
- **THEN** `flow` is offered

#### Scenario: Completing a repeated image
- **WHEN** the cursor sits after `src:` and the slide shows `/images/a.png` twice
- **THEN** the offered references distinguish the two occurrences rather than offering one ambiguous `/images/a.png`

#### Scenario: Completing fit
- **WHEN** the cursor sits after `fit:` in a `geometry.elements` entry
- **THEN** `contain` and `none` are offered

### Requirement: Quick fixes close the gap between an entry and its target
The extension SHALL offer a quick fix on a `geometry.elements` entry whose `id:` matches nothing, adding that id to a code or mermaid fence on the same slide. It SHALL also offer a quick fix on an unkeyed code fence, mermaid block, or table, which both gives the element an id and adds a `geometry.elements` entry for it. Writing ids into markdown is deliberately something the theme's own Layout tab never does, so these fixes are the only automated path to a keyed element.

#### Scenario: Fixing an unmatched id
- **WHEN** a slide declares `geometry.elements: [{id: flow, …}]`, no element carries that id, and the slide has exactly one mermaid fence
- **THEN** a quick fix is offered that adds `{id: 'flow'}` to that fence

#### Scenario: Positioning an unkeyed element
- **WHEN** the cursor is on a mermaid fence that carries no id and is positioned by no entry
- **THEN** a quick fix is offered that adds an id to the fence and a matching `geometry.elements` entry to the slide's frontmatter

#### Scenario: The added id is quoted
- **WHEN** a quick fix adds an id to a fence
- **THEN** the id is written quoted, since an unquoted id is read as a variable and never lands on the element
