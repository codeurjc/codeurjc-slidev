#!/usr/bin/env node

import fs from 'node:fs'
import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { blue, bold, cyan, dim, green, red, yellow } from 'ansis'
import minimist from 'minimist'
import path from 'pathe'
import prompts from 'prompts'
import { x } from 'tinyexec'
import { emptyDir, isRecognizedProject, removableEntries } from './project-dir.mjs'

const argv = minimist(process.argv.slice(2))
const cwd = process.cwd()
const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const { version } = require('./package.json')

const RE_VALID_PACKAGE_NAME = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
const RE_WHITESPACE = /\s+/g
const RE_LEADING_DOT_UNDERSCORE = /^[._]/
const RE_NON_ALPHANUMERIC = /[^a-z0-9-~]+/g

const renameFiles = {
  _gitignore: '.gitignore',
}

/** Normalizes a minimist value that may be given once or repeated into an array, always returning an array. */
function asArray(value) {
  if (value === undefined)
    return []
  return Array.isArray(value) ? value : [value]
}

async function init() {
  console.log()
  console.log(`  ${cyan('●') + blue('■') + yellow('▲')}`)
  console.log(`${bold('  CodeURJC Slidev') + dim(' Creator')}  ${blue(`v${version}`)}`)
  console.log()

  const yesAll = Boolean(argv.yes || argv.force)
  const skipExisting = Boolean(argv['skip-existing'])
  if (yesAll && skipExisting) {
    console.error(red('  --yes/--force and --skip-existing cannot be used together.'))
    process.exitCode = 1
    return
  }

  const fromOdpDir = typeof argv['from-odp-dir'] === 'string' ? argv['from-odp-dir'] : undefined
  const explicitFromOdp = asArray(argv['from-odp'])
  const explicitDeck = asArray(argv.deck)

  let targetDir = argv._[0]

  // Only fall back to the interactive "start from" prompt when nothing at all
  // was given on the command line: any multi-deck flag, or a bare --from-odp,
  // opts out of it (the batch below is built from the flags instead).
  let interactiveOdpPath
  if (!targetDir && fromOdpDir === undefined && explicitFromOdp.length === 0 && explicitDeck.length === 0) {
    const { mode } = await prompts({
      type: 'select',
      name: 'mode',
      message: 'Start from:',
      choices: [
        { title: 'An empty project', value: 'empty' },
        { title: 'An ODP presentation (LibreOffice Impress)', value: 'odp' },
      ],
    })
    if (mode === 'odp') {
      const { answer } = await prompts({ type: 'text', name: 'answer', message: 'Path to the .odp file:' })
      interactiveOdpPath = answer?.trim() ?? ''
    }
  }

  // --- Build the batch of decks to place ------------------------------------------

  const rawEntries = []
  if (fromOdpDir !== undefined) {
    const dirAbs = path.resolve(cwd, fromOdpDir)
    if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) {
      console.error(red(`  --from-odp-dir directory not found: ${fromOdpDir}`))
      process.exitCode = 1
      return
    }
    for (const f of fs.readdirSync(dirAbs).filter(f => f.toLowerCase().endsWith('.odp')).sort())
      rawEntries.push({ odpPath: path.join(dirAbs, f) })
  }
  if (explicitFromOdp.length > 0) {
    if (explicitDeck.length > 0 && explicitDeck.length !== explicitFromOdp.length) {
      console.error(red('  --deck was given a different number of times than --from-odp; pass one --deck per --from-odp, or none at all.'))
      process.exitCode = 1
      return
    }
    explicitFromOdp.forEach((p, i) => rawEntries.push({ odpPath: p, deck: explicitDeck[i] }))
  }
  else if (explicitDeck.length > 0) {
    // Bare --deck entries with no ODP: empty decks added to the project.
    explicitDeck.forEach(d => rawEntries.push({ deck: d }))
  }
  else if (interactiveOdpPath !== undefined) {
    rawEntries.push({ odpPath: interactiveOdpPath })
  }

  // Validate every ODP path up front, before any file is written.
  const batch = []
  for (const entry of rawEntries) {
    let odpAbs
    if (entry.odpPath !== undefined) {
      const abs = path.resolve(cwd, entry.odpPath)
      if (!entry.odpPath || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        console.error(red(`  ODP file not found: ${entry.odpPath || '(no path given)'}`))
        process.exitCode = 1
        return
      }
      odpAbs = abs
    }
    batch.push({ odpPath: odpAbs, explicitDeck: entry.deck })
  }

  // Slug resolution: an explicit --deck wins; otherwise a lone entry defaults
  // to `slides` (today's single-deck behavior), while an entry in a batch of
  // more than one derives its slug from its own ODP file name.
  const lone = batch.length === 1
  for (const entry of batch) {
    if (entry.explicitDeck)
      entry.slug = slugify(entry.explicitDeck)
    else if (lone)
      entry.slug = 'slides'
    else
      entry.slug = slugify(path.basename(entry.odpPath, path.extname(entry.odpPath)))
  }

  const seenSlugs = new Set()
  for (const entry of batch) {
    if (seenSlugs.has(entry.slug)) {
      console.error(red(`  Duplicate deck slug "${entry.slug}" in this batch.`))
      process.exitCode = 1
      return
    }
    seenSlugs.add(entry.slug)
  }

  // --- Target directory --------------------------------------------------------------

  if (!targetDir) {
    if (lone && batch[0]?.odpPath) {
      targetDir = slugify(path.basename(batch[0].odpPath, path.extname(batch[0].odpPath)))
    }
    else if (batch.length === 0) {
      const { projectName } = await prompts({
        type: 'text',
        name: 'projectName',
        message: 'Project name:',
        initial: 'slides',
      })
      targetDir = projectName.trim()
    }
    else {
      console.error(red('  A target directory is required with --deck, --from-odp-dir, or more than one --from-odp.'))
      process.exitCode = 1
      return
    }
  }

  // resolve, not join: an absolute target (`/tmp/deck`) must not land under cwd.
  const root = path.resolve(cwd, targetDir)

  const existedBefore = fs.existsSync(root)
  const recognized = existedBefore && isRecognizedProject(root)

  if (existedBefore && !recognized) {
    // Import reports don't count: they're kept across re-imports.
    if (removableEntries(root).length) {
      console.log(yellow(`  Target directory "${targetDir}" is not empty.`))
      const { yes } = await prompts({
        type: 'confirm',
        name: 'yes',
        initial: 'Y',
        message: 'Remove existing files (import reports are kept) and continue?',
      })
      if (yes)
        emptyDir(root)
      else
        return
    }
  }
  else if (!existedBefore) {
    fs.mkdirSync(root, { recursive: true })
  }

  const templateDir = path.join(__dirname, 'template')

  const write = (file, content) => {
    const targetPath = path.join(root, renameFiles[file] ?? file)
    if (content)
      fs.writeFileSync(targetPath, content)
    else
      copy(path.join(templateDir, file), targetPath)
  }

  let pkg
  if (!recognized) {
    console.log(dim('  Scaffolding project in ') + targetDir + dim(' ...'))
    const packageName = await getValidPackageName(targetDir)
    const files = fs.readdirSync(templateDir)
    // The batch's own deck(s) provide slides.md's content (or a namespaced
    // file) below; skip the template's placeholder to avoid a stray unused
    // slides.md when the batch places a differently-named deck.
    const skip = new Set(['package.json', 'README.md', ...(batch.length > 0 ? ['slides.md'] : [])])
    for (const file of files.filter(f => !skip.has(f)))
      write(file)
    pkg = require(path.join(templateDir, 'package.json'))
    pkg.name = packageName
  }
  else {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))
  }

  // --- Place every deck in the batch ------------------------------------------------

  const isBatchInvocation = fromOdpDir !== undefined || explicitDeck.length > 0 || explicitFromOdp.length > 1
  const needsImporter = batch.some(entry => entry.odpPath)
  let odpImport
  if (needsImporter) {
    try {
      odpImport = await import(new URL('./dist/odp-import.mjs', import.meta.url).href)
    }
    catch {
      console.error(red('  The ODP importer bundle is missing (dist/odp-import.mjs). Run `pnpm --filter create-codeurjc-slidev build` first.'))
      process.exitCode = 1
      return
    }
  }

  let placed = 0
  let overwritten = 0
  let skipped = 0

  for (const entry of batch) {
    const { slug, odpPath } = entry
    // See design.md Decision 4 / the multi-deck-projects spec: flat paths are
    // reserved for the one case matching today's exact single-deck behavior.
    const flat = slug === 'slides' && !recognized && batch.length === 1
    const deckFile = flat ? 'slides.md' : `${slug}.md`
    const codeBase = flat ? 'code' : `code/${slug}`
    const imagesBase = flat ? 'images' : `images/${slug}`
    const originalsBase = flat ? 'odp-originals' : `odp-originals/${slug}`
    const comparisonFile = flat ? 'comparison.md' : `${slug}-comparison.md`

    const deckPath = path.join(root, deckFile)
    const exists = fs.existsSync(deckPath)
    if (exists) {
      let proceed
      if (yesAll) {
        proceed = true
      }
      else if (skipExisting) {
        proceed = false
      }
      else if (!process.stdin.isTTY) {
        // Without a terminal `prompts` would silently end the whole run mid-batch.
        console.log(dim(`  Deck '${slug}' already exists; not overwriting without a terminal to ask (use --yes to overwrite, --skip-existing to skip quietly).`))
        proceed = false
      }
      else {
        const { yes } = await prompts({
          type: 'confirm',
          name: 'yes',
          initial: 'N',
          message: `Deck '${slug}' already exists — overwrite its slide file, code and images?`,
        })
        proceed = Boolean(yes)
      }
      if (!proceed) {
        console.log(dim(`  Skipped ${slug} (already exists)`))
        skipped++
        continue
      }
      if (!flat) {
        fs.rmSync(path.join(root, 'code', slug), { recursive: true, force: true })
        fs.rmSync(path.join(root, 'public', 'images', slug), { recursive: true, force: true })
        fs.rmSync(path.join(root, 'public', 'odp-originals', slug), { recursive: true, force: true })
      }
    }

    if (odpPath) {
      console.log(dim('  Importing ') + path.basename(odpPath) + dim(' ...'))
      const imported = await odpImport.importOdpProject({
        odpPath,
        root,
        codeDir: typeof argv.code === 'string' ? path.resolve(cwd, argv.code) : undefined,
        codeRepo: typeof argv['code-repo'] === 'string' ? argv['code-repo'] : undefined,
        version,
        deckFile,
        codeBase,
        imagesBase,
        originalsBase,
        comparisonFile,
      })
      // Per-deck scripts aren't generated (see design.md Non-Goals): these
      // only apply when the whole project is this one deck.
      if (batch.length === 1 && !recognized) {
        pkg.scripts.export = 'slidev export --with-clicks'
        if (imported.hasComparison)
          pkg.scripts['dev:compare'] = `slidev ${comparisonFile} --open`
      }
      for (const line of odpImport.formatReport(imported))
        console.log(line)
    }
    else {
      const stub = fs.readFileSync(path.join(templateDir, 'slides.md'), 'utf-8')
      fs.mkdirSync(path.dirname(deckPath), { recursive: true })
      fs.writeFileSync(deckPath, stub)
      console.log(dim('  Added empty deck ') + deckFile)
    }
    exists ? overwritten++ : placed++
  }

  if (isBatchInvocation)
    console.log(dim(`  ${placed} imported, ${overwritten} overwritten, ${skipped} skipped`))

  if (!recognized)
    write('package.json', JSON.stringify(pkg, null, 2))

  console.log(green('  Done.\n'))

  function getPkgManager() {
    const userAgent = process.env.npm_config_user_agent || ''
    const execPath = process.env.npm_execpath || ''
    if (execPath.includes('pnpm') || userAgent.includes('pnpm'))
      return 'pnpm'
    if (execPath.includes('yarn') || userAgent.includes('yarn'))
      return 'yarn'
    return null
  }
  const pkgManager = getPkgManager()

  // Adding to an already-installed project: nothing to install, and there's
  // no single obvious deck to start, so skip straight to the "start it later" hint.
  if (recognized) {
    console.log(dim('\n  preview a deck with:\n'))
    if (root !== cwd)
      console.log(blue(`  cd ${bold(path.relative(cwd, root))}`))
    for (const entry of batch)
      console.log(blue(`  ${pkgManager || 'npm'} run dev ${entry.slug}.md`))
    console.log()
    return
  }

  const { yes } = await prompts({
    type: 'confirm',
    name: 'yes',
    initial: 'Y',
    message: `Install and start it now${pkgManager ? ` using ${pkgManager}` : ''}?`,
  })

  if (yes) {
    const agent = pkgManager || (await prompts({
      name: 'agent',
      type: 'select',
      message: 'Choose the package manager',
      choices: ['npm', 'yarn', 'pnpm'].map(i => ({ value: i, title: i })),
    })).agent

    if (!agent)
      return

    writeReadme(agent)
    await x(agent, ['install'], { nodeOptions: { stdio: 'inherit', cwd: root } })
    await x(agent, ['run', 'dev'], { nodeOptions: { stdio: 'inherit', cwd: root } })
  }
  else {
    writeReadme(pkgManager)
    console.log(dim('\n  start it later by:\n'))
    if (root !== cwd)
      console.log(blue(`  cd ${bold(path.relative(cwd, root))}`))

    console.log(blue(`  ${pkgManager || 'npm'} install`))
    console.log(blue(`  ${pkgManager || 'npm'} run dev`))
    console.log()
    console.log(`  ${cyan('●')} ${blue('■')} ${yellow('▲')}`)
    console.log()
  }

  function writeReadme(pm = 'npm') {
    const readmeTemplate = fs.readFileSync(path.join(templateDir, 'README.md'), 'utf-8')
    const readmeContent = readmeTemplate
      .replace(/npm install/g, `${pm} install`)
      .replace(/npm run dev/g, `${pm} run dev`)
    write('README.md', readmeContent)
  }
}

function copy(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory())
    copyDir(src, dest)
  else
    fs.copyFileSync(src, dest)
}

async function getValidPackageName(projectName) {
  projectName = path.basename(projectName)
  if (RE_VALID_PACKAGE_NAME.test(projectName)) {
    return projectName
  }
  else {
    const suggestedPackageName = projectName
      .trim()
      .toLowerCase()
      .replace(RE_WHITESPACE, '-')
      .replace(RE_LEADING_DOT_UNDERSCORE, '')
      .replace(RE_NON_ALPHANUMERIC, '-')

    const { inputPackageName } = await prompts({
      type: 'text',
      name: 'inputPackageName',
      message: 'Package name:',
      initial: suggestedPackageName,
      validate: input => RE_VALID_PACKAGE_NAME.test(input) ? true : 'Invalid package.json name',
    })
    return inputPackageName
  }
}

// Default slug for an imported ODP (also used for the project directory name
// when none is given, and for a deck's slug/filename): its file name without
// diacritics, lowercased, with runs of anything else collapsed to `-`.
function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'slides'
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file)
    const destFile = path.resolve(destDir, file)
    copy(srcFile, destFile)
  }
}

init().catch((e) => {
  console.error(e)
})
