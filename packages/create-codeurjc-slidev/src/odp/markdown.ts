import type { Paragraph, TextRun } from './model'

// Turns parsed text (runs, paragraphs, tables) into markdown: inline
// bold/italic/code/links, nested bullet lists, plain paragraphs and pipe
// tables. Colors, underline and font sizes are intentionally dropped.

const ESCAPE_RE = /[\\`*_[\]<>|]/g

export function escapeMarkdown(text: string): string {
  return text.replace(ESCAPE_RE, ch => `\\${ch}`)
}

function codeSpan(text: string): string {
  const fence = text.includes('`') ? '``' : '`'
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

function sameHref(label: string, href: string): boolean {
  const norm = (s: string) => s.trim().replace(/\/+$/, '')
  return norm(label) === norm(href)
}

/**
 * Renders runs as inline markdown. Whitespace at a run's edges is moved outside
 * its `**`/`*`/link markers (`** a**` isn't valid emphasis), line breaks become
 * `<br>`, tabs and repeated spaces collapse to one space.
 */
export function runsToMarkdown(runs: TextRun[]): string {
  let out = ''
  for (const run of runs) {
    const raw = run.text.replace(/\t/g, ' ')
    const segments = raw.split('\n')
    segments.forEach((segment, index) => {
      if (index > 0)
        out += '<br>'
      const text = run.mono ? segment : segment.replace(/ {2,}/g, ' ')
      const leading = /^\s*/.exec(text)![0]
      const trailing = /\s*$/.exec(text.slice(leading.length))![0]
      const core = text.slice(leading.length, text.length - trailing.length)
      if (!core) {
        out += text ? ' ' : ''
        return
      }
      let md = run.mono ? codeSpan(core) : escapeMarkdown(core)
      if (run.href)
        md = sameHref(core, run.href) ? `<${run.href}>` : `[${md}](${run.href})`
      if (run.italic)
        md = `*${md}*`
      if (run.bold)
        md = `**${md}**`
      out += (leading ? ' ' : '') + md + (trailing ? ' ' : '')
    })
  }
  return out.replace(/ {2,}/g, ' ').trim()
}

/**
 * Renders paragraphs as markdown blocks: depth-0 paragraphs as plain
 * paragraphs, depth >= 1 as `- ` bullets indented two spaces per extra level.
 * Consecutive bullets form one list; blocks are separated by blank lines.
 */
export function paragraphsToMarkdown(paragraphs: Paragraph[]): string {
  const blocks: string[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length > 0)
      blocks.push(list.join('\n'))
    list = []
  }
  for (const p of paragraphs) {
    const text = runsToMarkdown(p.runs)
    if (!text)
      continue
    if (p.depth >= 1) {
      list.push(`${'  '.repeat(p.depth - 1)}- ${text}`)
    }
    else {
      flush()
      blocks.push(text)
    }
  }
  flush()
  return blocks.join('\n\n')
}

/** Renders table rows (rows -> cells -> paragraphs) as a pipe table, using the first row as the header. */
export function tableToMarkdown(rows: Paragraph[][][]): string {
  const cellText = (cell: Paragraph[]) => cell.map(p => runsToMarkdown(p.runs)).filter(Boolean).join('<br>')
  const textRows = rows.map(row => row.map(cellText)).filter(row => row.some(Boolean))
  if (textRows.length === 0)
    return ''
  const width = Math.max(...textRows.map(r => r.length))
  const pad = (r: string[]) => [...r, ...Array.from({ length: width - r.length }).fill('')]
  const line = (r: string[]) => `| ${pad(r).join(' | ')} |`
  const [head, ...body] = textRows
  return [line(head), `|${' --- |'.repeat(width)}`, ...body.map(line)].join('\n')
}
