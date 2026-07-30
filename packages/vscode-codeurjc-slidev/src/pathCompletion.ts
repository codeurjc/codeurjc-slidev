// Pure logic for `<<< @/code/...` path completion: determining whether the
// cursor sits inside a snippet-import's file-path token, and filtering a
// directory listing by what's been typed so far. Directory-reading itself is
// fs-backed (referenceIndex/scanner.ts's `listCodeRootDirectory`) and stays
// out of this module entirely.

export interface ImportPathContext {
  /** Path relative to the code root of the directory whose entries should be listed (e.g. '' for the root, 'ejer8' for a subdirectory). */
  dirRelPath: string
  /** The partial segment name typed so far, used to filter entries. */
  segmentPrefix: string
}

const IMPORT_PATH_RE = /^<<<\s*@\/([^\s[\]]*)$/

/** Determines whether `linePrefix` (the import line's text up to the cursor) sits inside a `<<< @/...` file-path token, and if so which code-root-relative directory to list and what prefix to filter its entries by. */
export function computeImportPathContext(linePrefix: string): ImportPathContext | null {
  const m = IMPORT_PATH_RE.exec(linePrefix)
  if (!m) return null
  const typed = m[1]
  const lastSlash = typed.lastIndexOf('/')
  if (lastSlash === -1) return { dirRelPath: '', segmentPrefix: typed }
  return { dirRelPath: typed.slice(0, lastSlash), segmentPrefix: typed.slice(lastSlash + 1) }
}

export interface PathEntry {
  name: string
  isDirectory: boolean
}

/** Filters directory entries to those whose name starts with `segmentPrefix`. */
export function filterPathEntries(entries: PathEntry[], segmentPrefix: string): PathEntry[] {
  return entries.filter(e => e.name.startsWith(segmentPrefix))
}
