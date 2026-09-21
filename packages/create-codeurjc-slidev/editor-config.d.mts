export declare const RECOMMENDED_EXTENSIONS: string[]
export type EnsureResult
  = | { status: 'created' | 'unchanged', file: string }
    | { status: 'updated', file: string, missing: string[] }
    | { status: 'skipped', file: string, reason: string, missing?: string[] }
/** Ensures `<root>/.vscode/extensions.json` recommends the extensions, adding only what is missing. */
export declare function ensureExtensionRecommendations(root: string, wanted?: string[]): EnsureResult
