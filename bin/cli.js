#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const core = require('../src/core.js');

const VERSION = require('../package.json').version;
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const col  = (c, s) => (useColor ? `\x1b[${c}m${s}\x1b[0m` : s);
const green  = s => col('32', s);
const red    = s => col('31', s);
const yellow = s => col('33', s);
const dim    = s => col('2',  s);
const bold   = s => col('1',  s);
const cyan   = s => col('36', s);

const HELP = `${bold('repogap')} — check a repo for missing files and manifest fields.

${bold('Usage')}
  repogap [options] [dir]

${bold('Options')}
  --strict           treat warnings as errors (exit 1)
  --no-changelog     skip CHANGELOG check
  --no-fields        skip manifest field checks
  --json             output JSON
  --version, -v      print repogap version
  --help, -h         show this help

${bold('Exit codes')}  0 clean  ·  1 issues found  ·  2 error

${bold('Checks (default)')}
  Files   README  LICENSE  .gitignore  CHANGELOG (warn)
  Fields  name  version  description  license  (package.json or pyproject.toml)
`;

function die(msg, code = 2) {
  process.stderr.write(red(`repogap: ${msg}\n`));
  process.exit(code);
}

function tryRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function listRoot(dir) {
  try { return fs.readdirSync(dir); } catch { return null; }
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP); process.exit(0); }
  if (argv.includes('--version') || argv.includes('-v')) { process.stdout.write(VERSION + '\n'); process.exit(0); }

  const strict      = argv.includes('--strict');
  const noChangelog = argv.includes('--no-changelog');
  const noFields    = argv.includes('--no-fields');
  const jsonMode    = argv.includes('--json');

  const positional = argv.filter(a => !a.startsWith('-'));
  const dir = path.resolve(positional[0] || '.');

  const fileList = listRoot(dir);
  if (!fileList) die(`cannot read directory: ${dir}`);

  // detect manifest
  let manifestContent = null;
  let manifestType = null;
  if (!noFields) {
    const pkgPath = path.join(dir, 'package.json');
    const pyPath  = path.join(dir, 'pyproject.toml');
    const pkgContent = tryRead(pkgPath);
    if (pkgContent) { manifestContent = pkgContent; manifestType = 'package'; }
    else {
      const pyContent = tryRead(pyPath);
      if (pyContent) { manifestContent = pyContent; manifestType = 'pyproject'; }
    }
  }

  const result = core.checkRepo(fileList, manifestContent, manifestType, { strict, noChangelog, noFields });

  const manifestLabel = manifestType === 'package' ? 'package.json'
                      : manifestType === 'pyproject' ? 'pyproject.toml'
                      : null;

  if (jsonMode) {
    const fileChecks = result.fileResults.map(r => ({
      name: r.name, level: r.level, ok: r.ok, ...(r.found ? { found: r.found } : {}),
    }));
    const fieldChecks = result.fieldResults.map(r => ({
      field: r.field, level: r.level, ok: r.ok, ...(r.value != null ? { value: r.value } : {}),
    }));
    process.stdout.write(JSON.stringify({
      ok: result.ok,
      errors: result.errors,
      warnings: result.warnings,
      manifestError: result.manifestError || null,
      fileChecks,
      fieldChecks,
    }, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  }

  process.stdout.write('\n');

  // file checks
  for (const r of result.fileResults) {
    const badge = r.ok ? green('✓') : r.level === 'required' ? red('✗') : yellow('!');
    const label = r.ok ? bold(r.found || r.name) : bold(r.name);
    const suffix = r.ok ? '' : r.level === 'required' ? red('  missing') : yellow('  missing (recommended)');
    process.stdout.write(`  ${badge} ${label}${suffix}\n`);
  }

  // manifest field checks
  if (!noFields && manifestLabel) {
    process.stdout.write('\n');
    process.stdout.write(`  ${dim(manifestLabel)}\n`);
    if (result.manifestError) {
      process.stdout.write(`    ${red('✗')} ${red(result.manifestError)}\n`);
    } else {
      for (const r of result.fieldResults) {
        const badge  = r.ok ? green('✓') : r.level === 'required' ? red('✗') : yellow('!');
        const suffix = r.ok ? cyan(`  ${r.value}`) : r.level === 'required' ? red('  missing or empty') : yellow('  missing');
        process.stdout.write(`    ${badge} ${bold(r.field)}${suffix}\n`);
      }
    }
  } else if (!noFields && !manifestLabel) {
    process.stdout.write('\n');
    process.stdout.write(`  ${yellow('!')} ${yellow('no package.json or pyproject.toml found')}\n`);
  }

  process.stdout.write('\n');

  if (!result.ok || result.errors.length > 0 || result.warnings.length > 0) {
    const parts = [];
    if (result.errors.length)   parts.push(red(`${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`));
    if (result.warnings.length) parts.push(yellow(`${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`));
    const summary = parts.length ? parts.join(', ') : '';
    if (!result.ok) {
      process.stderr.write(red(`repogap: drift detected — ${summary}\n`));
      process.exit(1);
    } else {
      process.stdout.write(`repogap: ${green('clean')}${summary ? ` — ${summary}` : ''}\n`);
      process.exit(0);
    }
  } else {
    process.stdout.write(green('repogap: all checks passed\n'));
    process.exit(0);
  }
}

main();
