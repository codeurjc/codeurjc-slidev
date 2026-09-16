/** Top-level entries a re-import keeps. */
export declare const KEPT_ON_REIMPORT: Set<string>
/** The target directory's entries that would be removed, i.e. everything but the kept ones. */
export declare function removableEntries(dir: string): string[]
/** Empties `dir` except for its top-level kept entries. */
export declare function emptyDir(dir: string, keep?: Set<string>): void
