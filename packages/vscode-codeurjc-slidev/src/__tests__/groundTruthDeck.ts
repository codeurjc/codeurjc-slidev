// The ground-truth deck for the click model: one slide per click source,
// with what real Slidev does on each. Shared by the model's unit test
// (clickModel.groundTruth.spec.ts) and the e2e test that checks Slidev itself
// (tests/click-model-ground-truth.spec.ts), so the two can't drift apart.
// Pure data: no imports, so Playwright's loader can read it too.

const FENCE = '```'
const GESTOR = '@/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java'

const SLIDES: string[] = [
  '# GT 1\n\nNo clicks',
  '# GT 2\n\n<div v-click>a</div>\n<div v-click>b</div>\n<div v-after>c</div>',
  `# GT 3\n\n<div v-click="'+2'">a</div>\n<div v-click="5">b</div>\n<div v-click="[1, 3]">c</div>\n<div v-click-hide>d</div>`,
  '# GT 4\n\n<v-click>\n\nx\n\n</v-click>\n\n<VClick at="4">y</VClick>',
  '# GT 5\n\n<v-clicks>\n\n- a\n- b\n- c\n\n</v-clicks>',
  '# GT 6\n\n<v-clicks every="2">\n\n- a\n- b\n- c\n\n</v-clicks>',
  '# GT 7\n\n<v-clicks depth="2">\n\n- a\n  - a1\n  - a2\n- b\n\n</v-clicks>',
  '# GT 8\n\n<v-click-gap size="3" />\n\n<div v-click>a</div>',
  '# GT 9\n\n- one {v-click}\n- two {v-click}',
  `# GT 10\n\n<div v-click>one</div>\n\n${FENCE}ts {1|3|5}\nl1\nl2\nl3\nl4\nl5\n${FENCE}`,
  `# GT 11\n\n${FENCE}java {1|3}\nint a = 1;\nint b = 2; // [!mark{2}] Two\nint c = 3;\n${FENCE}`,
  `# GT 12\n\n<div v-click>one</div>\n\n${FENCE}ts {1|2|3} {at: 3}\nl1\nl2\nl3\n${FENCE}`,
  `# GT 13\n\n${FENCE}java\nint a = 1; // [!mark{4}] Four\n${FENCE}\n\n${FENCE}ts {1|2}\nl1\nl2\n${FENCE}`,
  `# GT 14\n\n<div v-click="'+2'">\n\n${FENCE}ts {1|2}\nl1\nl2\n${FENCE}\n\n</div>`,
  '# GT 15\n\n$$ {1|2|3}\na \\\\\nb \\\\\nc\n$$',
  `# GT 16\n\n<<< ${GESTOR}[7-22] java\n[!mark:2{3}] Three`,
  `# GT 18\n\n${FENCE}ts {2}\nl1\nl2\n${FENCE}`,
  '# GT 19\n\n<div v-click>a</div>\n<div v-click="1">b</div>\n<div v-click>c</div>',
  // eslint-disable-next-line no-template-curly-in-string -- KaTeX `$$` followed by `{ranges}`, not a template
  '# GT 20\n\n$${1|2|3}\na \\\\\nb \\\\\nc\n$$',
  '# GT 21\n\nInline [one]{v-click} and [two]{v-click}',
  '# GT 22\n\n$$\n{1|2}\na \\\\\nb\n$$',
]

// Slide 17 carries its own frontmatter, so it's spliced in separately.
const FRONTMATTER_SLIDE = '---\nclicks: 6\n---\n\n# GT 17\n\n<div v-click>a</div>'

// Slide 23: a slide callout with a click step, from frontmatter.
const CALLOUT_SLIDE = '---\ncallouts:\n  - at: {x: 100, y: 100}\n    text: Stepped callout\n    step: 2\n---\n\n# GT 23\n\nText'

function deckText(): string {
  const bodies = [...SLIDES]
  const head = '---\ntheme: codeurjc-slidev-theme\nlayout: default\ncolorSchema: light\naspectRatio: 16/9\nmdc: true\n---\n\n'
  const before = bodies.slice(0, 16).join('\n\n---\n\n')
  const after = bodies.slice(16).join('\n\n---\n\n')
  return `${head}${before}\n\n${FRONTMATTER_SLIDE}\n\n---\n\n${after}\n\n${CALLOUT_SLIDE}\n`
}

export const GROUND_TRUTH_DECK = deckText()

/** The code import path used by slide 16, relative to the deck directory. */
export const GROUND_TRUTH_IMPORT = GESTOR

/** Each slide's click total, as Slidev 52.19.1 computes it (in slide order). */
export const GROUND_TRUTH_TOTALS = [0, 2, 5, 4, 3, 2, 4, 4, 0, 3, 2, 4, 4, 3, 0, 3, 6, 0, 2, 0, 0, 0, 2]

/**
 * Slides the model declines to count (its total is null): MDC `{v-click}`
 * attributes (9, 21) and KaTeX line ranges (15, 20, 22). Slidev registered no
 * clicks for any of them here, but that isn't something to rely on, so the
 * model gives no number rather than 0.
 */
export const GROUND_TRUTH_UNCOUNTABLE = [9, 15, 20, 21, 22]

/** Native fence range segments: slide, code line within its block, the click it highlights at. */
export const GROUND_TRUTH_SEGMENTS: [slide: number, lineInBlock: number, click: number][] = [
  [10, 3, 2],
  [10, 5, 3],
  [11, 3, 1],
  [12, 2, 3],
  [12, 3, 4],
  [13, 2, 1],
  [14, 2, 1],
]
