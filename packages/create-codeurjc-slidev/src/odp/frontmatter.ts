// Minimal YAML serializer for the frontmatter the importer writes: strings,
// numbers, booleans, nested objects (block style) and lists of flat objects
// (flow style, e.g. geometry rects). Strings are left plain when unambiguous,
// otherwise written as JSON strings (valid YAML double-quoted scalars).

type Value = string | number | boolean | null | undefined | Value[] | { [key: string]: Value }

const RESERVED_RE = /^(?:true|false|yes|no|on|off|null|~|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i
const PLAIN_RE = /^[^\s\-?:,[\]{}#&*!|>'"%@`][^:#\n]*$/

function scalar(value: string | number | boolean | null): string {
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (value === null)
    return 'null'
  if (value === '' || RESERVED_RE.test(value) || !PLAIN_RE.test(value) || /\s$/.test(value))
    return JSON.stringify(value)
  return value
}

function isFlat(obj: { [key: string]: Value }): boolean {
  return Object.values(obj).every(v => v === null || ['string', 'number', 'boolean'].includes(typeof v))
}

function flowMap(obj: { [key: string]: Value }): string {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined)
  return `{ ${entries.map(([k, v]) => `${k}: ${scalar(v as string | number | boolean | null)}`).join(', ')} }`
}

function lines(obj: { [key: string]: Value }, indent: string): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined)
      continue
    if (Array.isArray(value)) {
      out.push(`${indent}${key}:`)
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item))
          out.push(`${indent}  - ${isFlat(item) ? flowMap(item) : JSON.stringify(item)}`)
        else
          out.push(`${indent}  - ${scalar(item as string | number | boolean | null)}`)
      }
    }
    else if (value && typeof value === 'object') {
      if (isFlat(value) && indent) {
        out.push(`${indent}${key}: ${flowMap(value)}`)
      }
      else {
        out.push(`${indent}${key}:`)
        out.push(...lines(value, `${indent}  `))
      }
    }
    else {
      out.push(`${indent}${key}: ${scalar(value)}`)
    }
  }
  return out
}

/** Serializes frontmatter fields as YAML lines (without the `---` fences). */
export function toYaml(obj: { [key: string]: Value }): string {
  return lines(obj, '').join('\n')
}
