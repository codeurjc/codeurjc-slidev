## ADDED Requirements

### Requirement: Import reports survive re-importing into the same project
When the scaffolder targets a non-empty directory, a top-level `import-reports/` directory SHALL be ignored when deciding whether the directory is empty. It SHALL also be kept when the user agrees to remove the existing files. The prompt SHALL say that import reports are kept. Scaffolded projects SHALL ignore `import-reports/` in their `.gitignore`.

#### Scenario: Re-import keeps earlier reports
- **WHEN** a user re-imports an ODP into a project that already has `slides.md`, `public/` and `import-reports/import-report-2026-09-16T20-45-12.md`, and confirms removing the existing files
- **THEN** `slides.md` and `public/` are replaced by the new import, the earlier report is still there, and a second report is added next to it

#### Scenario: Directory with only reports counts as empty
- **WHEN** the target directory contains nothing but `import-reports/`
- **THEN** the scaffolder doesn't ask to remove existing files, and the reports are kept

#### Scenario: Reports aren't committed by default
- **WHEN** a project is scaffolded
- **THEN** its `.gitignore` contains `import-reports/`
