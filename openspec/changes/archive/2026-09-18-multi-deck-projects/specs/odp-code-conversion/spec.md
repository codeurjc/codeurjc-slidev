## MODIFIED Requirements

### Requirement: The code folder is located by convention or flag, copied, never cloned
The importer SHALL use `--code <dir>` when given. Otherwise it SHALL use a directory next to the ODP whose name equals the ODP's file name without extension. When a code folder is found, it SHALL be copied into the deck's code directory — `<project>/code/` for a lone default deck (per the `multi-deck-projects` capability's flat-vs-namespaced rule), otherwise `<project>/code/<slug>/` — excluding build and tooling directories (`target`, `node_modules`, `.git`, `build`, `dist`, `.idea`). The importer SHALL NOT clone any repository. With no code folder, every code block SHALL stay a hand-typed fence.

#### Scenario: Same-name folder found
- **WHEN** `odp/Tema 1.2 - Pruebas unitarias.odp` is imported without `--code` and `odp/Tema 1.2 - Pruebas unitarias/` exists
- **THEN** that folder's contents are copied into the deck's code directory, without any `target/` directories

#### Scenario: Explicit flag wins
- **WHEN** `--code other/dir` is given and a same-name folder also exists
- **THEN** `other/dir` is copied into the deck's code directory, and the same-name folder is ignored

#### Scenario: No code folder
- **WHEN** no `--code` is given and no same-name folder exists
- **THEN** no code contents are copied, and every code block is emitted as a hand-typed fence

#### Scenario: A namespaced deck's code lands under its own subfolder
- **WHEN** an ODP is imported as deck `tema1` into a project that already has another deck
- **THEN** its code folder's contents are copied into `<project>/code/tema1/`, not the project's root `code/`

### Requirement: Exactly matching code becomes a snippet import
A code block SHALL become a `<<< @/code/<path>[selector] <lang>` import — where `<path>` is prefixed with `<slug>/` for a namespaced deck — when its non-blank lines all match one contiguous run of non-blank lines in a single file under the deck's own copied code folder, with whitespace-insensitive comparison. The selector SHALL be a content-anchor range (`"first line".."last line"`) when both boundary lines are non-blank and occur exactly once in the file, otherwise a 1-based line range. There SHALL be no selector when the match spans the whole file. When several files match equally, the file whose path contains the slide's project label (e.g. `ejem1`) SHALL be preferred, then the shortest path.

#### Scenario: Whole test class matches
- **WHEN** a slide's code block matches all of `code/ejem1/src/test/java/es/codeurjc/test/ejem/Calculadora1Test.java`
- **THEN** the slide contains `<<< @/code/ejem1/src/test/java/es/codeurjc/test/ejem/Calculadora1Test.java java` instead of an inline fence

#### Scenario: Partial range with unique boundary lines
- **WHEN** a code block matches lines 11–15 of `code/ejem0/pom.xml`, and its first and last lines each occur once in that file
- **THEN** the import uses a content-anchor range selector built from those two lines

#### Scenario: Ambiguous match resolved by project label
- **WHEN** a code block matches identical files in `code/ejer8/` and `code/ejer8_enunciado/`, and the slide carries the label `ejer8`
- **THEN** the import references the file under `code/ejer8/`

#### Scenario: A namespaced deck's import path is prefixed with its slug
- **WHEN** deck `tema1`'s code block matches `code/tema1/ejer1/Foo.java`
- **THEN** the slide contains `<<< @/code/tema1/ejer1/Foo.java java`
