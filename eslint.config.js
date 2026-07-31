import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  vue: true,
  pnpm: true,
  ignores: [
    'code/**',
    'e2e/layouts/**',
    '.e2e-worker-*/**',
    'packages/vscode-codeurjc-slidev/.vscode-test/**',
    'packages/vscode-codeurjc-slidev/test-extension/fixture/**',
    'packages/create-codeurjc-slidev/template/**',
  ],
}, {
  // A scaffolding CLI's whole job is user-facing console output.
  files: ['packages/create-codeurjc-slidev/index.mjs'],
  rules: {
    'no-console': 'off',
  },
}, {
  // Standalone Node ESM build script -- top-level await is the idiomatic
  // shape here, not an accident.
  files: ['packages/vscode-codeurjc-slidev/esbuild.js'],
  rules: {
    'antfu/no-top-level-await': 'off',
  },
}, {
  // Mocha's global test functions, used by the extension-host smoke suite.
  files: ['packages/vscode-codeurjc-slidev/test-extension/suite/**/*.cjs'],
  languageOptions: {
    globals: {
      describe: 'readonly',
      it: 'readonly',
      before: 'readonly',
      after: 'readonly',
      beforeEach: 'readonly',
      afterEach: 'readonly',
    },
  },
}, {
  // Playwright's `.innerText()` is layout/visibility-aware, unlike
  // `.textContent()` -- not the same rule's DOM-node concern.
  files: ['tests/**/*.spec.ts'],
  rules: {
    'unicorn/prefer-dom-node-text-content': 'off',
  },
}, {
  // Playwright fixture typing (`base.extend<{}, {...}>`) and fixture
  // function signatures (`async ({}, use, workerInfo) => ...`) require
  // an empty-object type/pattern by the framework's own convention.
  files: ['tests/fixtures.ts'],
  rules: {
    'ts/no-empty-object-type': 'off',
    'no-empty-pattern': 'off',
  },
}, {
  // These marker/anchor-grammar regexes run only against the presentation
  // author's own local slides.md/source files, not untrusted network input
  // -- the super-linear-backtracking risk this rule flags isn't reachable
  // from an attacker-controlled boundary here.
  files: [
    'packages/codeurjc-slidev-theme/composables/useCodeHighlights.ts',
    'packages/codeurjc-slidev-theme/composables/useSlideTitleCarryover.ts',
    'packages/codeurjc-slidev-theme/composables/useSnippetImport.ts',
  ],
  rules: {
    'regexp/no-super-linear-backtracking': 'off',
  },
})
  // Slide decks (slides.md, tutorial.md, ...) are `---`-separated slides,
  // each legitimately starting with its own `# heading` -- not a single
  // conventional document, so markdown's single-H1 assumption doesn't apply.
  .remove('antfu/markdown/rules')
