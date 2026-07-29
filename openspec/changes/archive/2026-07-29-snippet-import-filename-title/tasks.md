## 1. Parsing

- [x] 1.1 Extend `parseSnippetImportLine` (`composables/useSnippetImport.ts`) to recognize an optional trailing `notitle` keyword after the language token, returning it on `ParsedSnippetImportLine` (e.g. as `notitle: boolean`)
- [x] 1.2 Add unit tests in `composables/__tests__/useSnippetImport.spec.ts` covering: language parsed correctly with and without `notitle`; `notitle` absent by default

## 2. Fence generation

- [x] 2.1 In `setup/transformers.ts`, compute the imported file's basename from `parsed.filePath`
- [x] 2.2 Splice `[basename]` into the generated fence's info string (`` ```lang [basename]``) unless `notitle` was set, in which case emit the fence without a title

## 3. Tests

- [x] 3.1 Update `tests/code-snippet-import.spec.ts` (or add a new e2e spec) to assert the title bar renders with the imported file's basename for a `<<<` import
- [x] 3.2 Add an e2e case asserting `notitle` suppresses the title bar
- [x] 3.3 Run `pnpm test && pnpm test:e2e` and confirm all pass

## 4. Docs

- [x] 4.1 Update `CLAUDE.md`'s "Code snippet import" section to document the title behavior and the `notitle` opt-out
