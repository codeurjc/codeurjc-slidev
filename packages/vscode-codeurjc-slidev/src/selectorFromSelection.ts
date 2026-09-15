// The selector-choice rule behind the "Copy Selector for Selection" command
// now lives in the theme package (`useSnippetImport.ts`), where the ODP
// importer shares it -- re-exported here so the extension's existing imports
// keep working unchanged.
export { computeSelectorForSelection } from 'codeurjc-slidev-theme/composables/useSnippetImport'
export type { SelectionLineRange } from 'codeurjc-slidev-theme/composables/useSnippetImport'
