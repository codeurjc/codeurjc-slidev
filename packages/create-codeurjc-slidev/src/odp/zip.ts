import { strFromU8, unzipSync } from 'fflate'

export interface OdpArchive {
  content: string
  styles: string
  /** Every archive entry, keyed by its path inside the archive. */
  files: Map<string, Uint8Array>
}

/** Reads an ODP (a zip archive) into its XML parts and raw entries. */
export function readOdpArchive(data: Uint8Array): OdpArchive {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(data)
  }
  catch (error) {
    throw new Error(`Not a readable ODP file (invalid zip archive): ${(error as Error).message}`)
  }
  const content = entries['content.xml']
  if (!content)
    throw new Error('Not an ODP presentation: content.xml is missing')
  const styles = entries['styles.xml']
  return {
    content: strFromU8(content),
    styles: styles ? strFromU8(styles) : '',
    files: new Map(Object.entries(entries)),
  }
}
