# odp-code-conversion

## Purpose

Turns code drawn in an ODP deck into theme code blocks: monospace shapes become fenced code with an inferred language and filename title, exact matches against the deck's code folder become `<<<` snippet imports, near matches stay inline with a source link, the source-link base URL comes from the folder's GitHub origin or a flag, and highlight boxes, labels and connectors over code become code-highlight marks and callouts.

## Requirements

### Requirement: Monospace text shapes become fenced code blocks
A text shape whose text is mostly (more than 60% of its characters) in a monospace font SHALL become a fenced code block. So SHALL a bordered text box whose lines start with a shell prompt (`$ `), even without a monospace font. Paragraphs and line breaks SHALL become code lines. Tabs SHALL be expanded to four spaces, and leading and trailing blank lines trimmed. Syntax coloring and other span styling SHALL be ignored.

#### Scenario: Code stored as one paragraph with line breaks
- **WHEN** a monospace shape contains a single paragraph `<build>⏎⇥<plugins>⏎⇥⇥<plugin>…` using line breaks and tabs
- **THEN** a fenced code block is emitted whose lines are `<build>`, `    <plugins>`, `        <plugin>`, …

#### Scenario: Terminal box without a monospace font
- **WHEN** a bordered Arial text box contains `$ docker run hello-world` followed by output lines
- **THEN** a fenced code block with language `shell` is emitted with those lines

### Requirement: Code language is inferred
The code block's language SHALL come from an adjacent filename label's extension when present. Otherwise it SHALL be inferred from content:
- XML/HTML when the first line starts with `<`;
- `shell` for `$ ` prompts;
- YAML for top-level `key:` structure such as `name:`/`on:`/`jobs:`;
- Java for `package`/`import`/`class`/annotation patterns;
- JavaScript for `function`/`describe(`/`const` patterns.

It SHALL be `text` when nothing matches.

#### Scenario: Language from a filename label
- **WHEN** a code shape has a small adjacent label shape reading `basic-workflow.yml`
- **THEN** the code block's language is `yaml`

#### Scenario: Unknown language
- **WHEN** a code shape contains `Complex(0,0) + Complex(1,1) == Complex(1,1)` and no label
- **THEN** the code block's language is `text`

### Requirement: A filename label becomes the code block title
A short text shape containing only a file name (`<name>.<ext>`), positioned at an edge of a code shape, SHALL be used as that code block's title and not emitted separately.

#### Scenario: Label above a code block
- **WHEN** a label `ListTest.java` sits on the top edge of a Java code shape
- **THEN** the emitted code block has the title `ListTest.java`, and no separate `ListTest.java` text appears on the slide

### Requirement: The code folder is located by convention or flag, copied, never cloned
The importer SHALL use `--code <dir>` when given. Otherwise it SHALL use a directory next to the ODP whose name equals the ODP's file name without extension. When a code folder is found, it SHALL be copied into `<project>/code/`, excluding build and tooling directories (`target`, `node_modules`, `.git`, `build`, `dist`, `.idea`). The importer SHALL NOT clone any repository. With no code folder, every code block SHALL stay a hand-typed fence.

#### Scenario: Same-name folder found
- **WHEN** `odp/Tema 1.2 - Pruebas unitarias.odp` is imported without `--code` and `odp/Tema 1.2 - Pruebas unitarias/` exists
- **THEN** that folder's contents are copied into `<project>/code/`, without any `target/` directories

#### Scenario: Explicit flag wins
- **WHEN** `--code other/dir` is given and a same-name folder also exists
- **THEN** `other/dir` is copied into `<project>/code/`, and the same-name folder is ignored

#### Scenario: No code folder
- **WHEN** no `--code` is given and no same-name folder exists
- **THEN** no `code/` contents are copied, and every code block is emitted as a hand-typed fence

### Requirement: Exactly matching code becomes a snippet import
A code block SHALL become a `<<< @/code/<path>[selector] <lang>` import when its non-blank lines all match one contiguous run of non-blank lines in a single file under the copied code folder, with whitespace-insensitive comparison. The selector SHALL be a content-anchor range (`"first line".."last line"`) when both boundary lines are non-blank and occur exactly once in the file, otherwise a 1-based line range. There SHALL be no selector when the match spans the whole file. When several files match equally, the file whose path contains the slide's project label (e.g. `ejem1`) SHALL be preferred, then the shortest path.

#### Scenario: Whole test class matches
- **WHEN** a slide's code block matches all of `code/ejem1/src/test/java/es/codeurjc/test/ejem/Calculadora1Test.java`
- **THEN** the slide contains `<<< @/code/ejem1/src/test/java/es/codeurjc/test/ejem/Calculadora1Test.java java` instead of an inline fence

#### Scenario: Partial range with unique boundary lines
- **WHEN** a code block matches lines 11–15 of `code/ejem0/pom.xml`, and its first and last lines each occur once in that file
- **THEN** the import uses a content-anchor range selector built from those two lines

#### Scenario: Ambiguous match resolved by project label
- **WHEN** a code block matches identical files in `code/ejer8/` and `code/ejer8_enunciado/`, and the slide carries the label `ejer8`
- **THEN** the import references the file under `code/ejer8/`

### Requirement: Near-matching code stays inline with a source link
A code block that matches at least half of its non-blank lines in one file, but isn't an exact contiguous match (elided with `…`/`...`, or drifted from the file), SHALL stay a hand-typed fence showing the slide's own text. It SHALL carry a `// [!source <url>]` marker linking to the near-matching file's line span when a source-link base URL is known. It SHALL be recorded as a loss noting the file it differs from.

#### Scenario: Elided method bodies
- **WHEN** a code block shows `public void testSuma() { … }` where the file has the full method body
- **THEN** the slide keeps the elided text in a fence with a `// [!source …/Calculadora5Test.java#L1-L47]` marker, and a loss "code differs from Calculadora5Test.java" is recorded

### Requirement: Source-link base URL comes from the code folder's origin or a flag
The importer SHALL derive a GitHub base URL for the code folder. When `--code-repo <url>` is given, it SHALL be used, as `https://github.com/<owner>/<repo>` optionally followed by `/tree/<branch>/<subpath>`, which maps the code folder's root to that subpath. Otherwise the importer SHALL walk up from the code folder to the nearest `.git`, read its GitHub `origin`, and resolve the branch the same way the theme's source links do. With a base URL, every emitted import SHALL carry an explicit `[!source <url>]` directive and every near-match fence a `// [!source <url>]` marker, so links work even though `<project>/code/` is a plain copy. Without one, no source links SHALL be written, and the console SHALL say that no GitHub origin was found.

#### Scenario: Flag provides the base URL
- **WHEN** the import runs with `--code-repo https://github.com/codigus-formacion/pruebas/tree/main/testing_unitario` and a code block matches `code/ejem1/src/test/java/es/codeurjc/test/ejem/SumTest.java` lines 1–16
- **THEN** the import line is followed by `[!source https://github.com/codigus-formacion/pruebas/blob/main/testing_unitario/ejem1/src/test/java/es/codeurjc/test/ejem/SumTest.java#L1-L16]`

#### Scenario: Git origin detected from the code folder
- **WHEN** no `--code-repo` is given and the code folder sits inside a git checkout whose `origin` is `git@github.com:codigus-formacion/pruebas.git` with default branch `main`
- **THEN** source links use `https://github.com/codigus-formacion/pruebas/blob/main/<path from repo root>`

#### Scenario: No origin and no flag
- **WHEN** the code folder isn't inside a git checkout (or git ignores it) and no `--code-repo` is given
- **THEN** imports and fences carry no `[!source …]`, and the console reports that source links were skipped

### Requirement: Code annotations become highlights and callouts
The importer SHALL convert annotations drawn over a code block into highlights and callouts, as follows:
- A rectangle containing the vertical centers of one or more non-blank code lines, by a margin of at least 0.15 line height, SHALL become a line or line-range highlight over those lines.
- A rectangle narrower than the code block, spanning one line, SHALL become a substring highlight, with its character range derived from the monospace column width.
- A text box connected to a highlight rectangle by an arrow or connector, or a short label placed inside the rectangle near its top edge, SHALL become that highlight's callout comment.
- A rectangle framing the whole code block SHALL become a whole-block range highlight only when it carries a label, and SHALL otherwise be ignored without a loss.
- A text box connected by an arrow straight into the code block SHALL become a line highlight on the non-blank line nearest the arrow's endpoint.
- A callout's ODP position SHALL become its `@x,y` override, mapped to slide-canvas pixels.
- Nested rectangles SHALL become nested ranges.

For snippet imports these are written as anchor declaration lines (`[!mark:N..M]`, `[!mark:"text"]`); for hand-typed fences, as inline `// [!mark…]` markers. A fence line holds one inline marker, so when two highlights need the same line the narrower one SHALL be written and the wider one recorded as a loss. Rectangles that contain no line center, and callouts that can't be paired, SHALL be recorded as losses.

#### Scenario: Nested workflow/job boxes on YAML
- **WHEN** a YAML code shape is overlaid by an outer rectangle spanning all lines labeled "WORKFLOW" and an inner rectangle spanning the job's lines labeled "JOB"
- **THEN** the importer produces a range highlight with comment "WORKFLOW" covering all lines, and a nested range highlight with comment "JOB" covering the job's lines
- **AND** when both ranges end on the same line of a hand-typed fence, only the "JOB" range is written and the "WORKFLOW" range is recorded as a loss

#### Scenario: Callout connected by an arrow to a substring box
- **WHEN** a narrow rectangle surrounds `steps:` on one line and an arrow connects it to a text box "Cada Job se ejecuta en un runner"
- **THEN** a substring highlight covering `steps:` is emitted with that comment and an `@x,y` override matching the text box's mapped position

#### Scenario: Misaligned rectangle recorded as a loss
- **WHEN** a highlight rectangle is drawn between two code lines without containing either line's vertical center
- **THEN** no highlight is emitted for it, and a loss "highlight box not aligned to code lines" is recorded for that slide

### Requirement: Code build-ups become callout click steps
When the build-up rule merges consecutive slides showing the same code, each merged slide's added highlights and callouts SHALL get click step `{k}`, where k is the merged slide's position after the first slide (1 for the second slide, 2 for the third, …). Highlights present from the first slide SHALL have no step.

#### Scenario: Three-slide code build-up
- **WHEN** three consecutive slides show the same code, the second adds one callout and the third adds another
- **THEN** the merged slide's callout from the second slide carries `{1}` and the one from the third slide carries `{2}`
