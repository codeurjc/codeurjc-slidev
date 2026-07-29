## ADDED Requirements

### Requirement: One-command project scaffold
A `create-codeurjc-slidev` npm package SHALL be published such that running `pnpm create codeurjc-slidev <name>` (or the npm/yarn/bun equivalents) generates a new directory containing a working `package.json`, a starter `slides.md`, and an empty `code/` directory, without the user hand-writing any of those files.

#### Scenario: Scaffold a new presentation repo
- **WHEN** a user runs `pnpm create codeurjc-slidev my-talk`
- **THEN** a `my-talk/` directory is created containing `package.json` (with `name: "my-talk"`, depending on `@slidev/cli` and `codeurjc-slidev-theme`, and `dev`/`build`/`export` scripts), a starter `slides.md` whose frontmatter includes `theme: codeurjc-slidev-theme`, and an empty `code/` directory

### Requirement: Scaffolded project runs without further setup
After running `pnpm install` inside a freshly scaffolded project, `pnpm dev` SHALL start a working Slidev dev server presenting the starter `slides.md` with the theme's default layout and editor active, with no additional files or configuration needed.

#### Scenario: Scaffolded project starts immediately
- **WHEN** a user runs `pnpm install && pnpm dev` inside a directory produced by `create-codeurjc-slidev`
- **THEN** the Slidev dev server starts successfully and the starter slide renders with the theme's default layout, without requiring the user to create a `vite.config.ts`, `composables/`, or `_override/` directory

### Requirement: Scaffold does not prompt for or require an existing slides.md or code/ to copy from
The scaffold SHALL generate its starter content from a bundled template only; it SHALL NOT read, scan, or copy from this repo's own `slides.md` or `code/` directory, and SHALL NOT attempt to determine which code files a new project "needs" from any existing presentation.

#### Scenario: Scaffold is independent of this repo's own content
- **WHEN** `create-codeurjc-slidev` is run from any location, including outside a clone of this repo
- **THEN** it produces the same starter project regardless of what this repo's own `slides.md`/`code/` currently contain
