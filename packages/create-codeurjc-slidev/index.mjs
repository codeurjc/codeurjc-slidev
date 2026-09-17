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
import { emptyDir, removableEntries } from './project-dir.mjs'

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

async function init() {
  console.log()
  console.log(`  ${cyan('●') + blue('■') + yellow('▲')}`)
  console.log(`${bold('  CodeURJC Slidev') + dim(' Creator')}  ${blue(`v${version}`)}`)
  console.log()

  let targetDir = argv._[0]
  let odpPath = typeof argv['from-odp'] === 'string' ? argv['from-odp'] : undefined

  if (!targetDir && odpPath === undefined) {
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
      odpPath = answer?.trim() ?? ''
    }
  }

  // Validate the ODP before anything is written, so a bad path leaves no half-made project behind.
  if (odpPath !== undefined) {
    const absolute = path.resolve(cwd, odpPath)
    if (!odpPath || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      console.error(red(`  ODP file not found: ${odpPath || '(no path given)'}`))
      process.exitCode = 1
      return
    }
    odpPath = absolute
    if (!targetDir)
      targetDir = slugify(path.basename(odpPath, path.extname(odpPath)))
  }

  if (!targetDir) {
    const { projectName } = await prompts({
      type: 'text',
      name: 'projectName',
      message: 'Project name:',
      initial: 'slides',
    })
    targetDir = projectName.trim()
  }
  const packageName = await getValidPackageName(targetDir)
  // resolve, not join: an absolute target (`/tmp/deck`) must not land under cwd.
  const root = path.resolve(cwd, targetDir)

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }
  else {
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

  console.log(dim('  Scaffolding project in ') + targetDir + dim(' ...'))

  const templateDir = path.join(__dirname, 'template')

  const write = (file, content) => {
    const targetPath = path.join(root, renameFiles[file] ?? file)
    if (content)
      fs.writeFileSync(targetPath, content)
    else
      copy(path.join(templateDir, file), targetPath)
  }

  const files = fs.readdirSync(templateDir)
  for (const file of files.filter(f => f !== 'package.json' && f !== 'README.md'))
    write(file)

  const pkg = require(path.join(templateDir, 'package.json'))
  pkg.name = packageName

  if (odpPath) {
    console.log(dim('  Importing ') + path.basename(odpPath) + dim(' ...'))
    let odpImport
    try {
      odpImport = await import(new URL('./dist/odp-import.mjs', import.meta.url).href)
    }
    catch {
      console.error(red('  The ODP importer bundle is missing (dist/odp-import.mjs). Run `pnpm --filter create-codeurjc-slidev build` first.'))
      process.exitCode = 1
      return
    }
    const imported = await odpImport.importOdpProject({
      odpPath,
      root,
      codeDir: typeof argv.code === 'string' ? path.resolve(cwd, argv.code) : undefined,
      codeRepo: typeof argv['code-repo'] === 'string' ? argv['code-repo'] : undefined,
      version,
    })
    // Click steps produced by the import (callout steps, merged build-ups) are kept as separate PDF pages.
    pkg.scripts.export = 'slidev export --with-clicks'
    if (imported.hasComparison)
      pkg.scripts['dev:compare'] = 'slidev comparison.md --open'
    for (const line of odpImport.formatReport(imported))
      console.log(line)
  }

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

// Default project directory for an imported ODP: its file name without
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
