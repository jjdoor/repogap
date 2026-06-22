'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkFiles, checkPkgFields, checkPyprojectFields, checkRepo, findFile } = require('../src/core.js');

// ── findFile ──────────────────────────────────────────────────────────────────

describe('findFile', () => {
  it('finds first matching candidate', () => {
    const s = new Set(['readme.md', 'license']);
    assert.equal(findFile(s, ['readme.md', 'readme.rst']), 'readme.md');
  });
  it('returns null when none match', () => {
    assert.equal(findFile(new Set(['foo.js']), ['readme.md']), null);
  });
  it('is case-sensitive on the set (caller normalises)', () => {
    assert.equal(findFile(new Set(['readme.md']), ['README.MD']), null);
  });
});

// ── checkFiles ────────────────────────────────────────────────────────────────

describe('checkFiles', () => {
  function files(...names) {
    return new Set(names.map(n => n.toLowerCase()));
  }

  it('all present → all ok', () => {
    const s = files('README.md', 'LICENSE', '.gitignore', 'CHANGELOG.md');
    const r = checkFiles(s);
    assert.ok(r.every(x => x.ok));
  });

  it('missing README → error', () => {
    const r = checkFiles(files('LICENSE', '.gitignore'));
    const readme = r.find(x => x.name === 'README');
    assert.equal(readme.ok, false);
    assert.equal(readme.level, 'required');
  });

  it('missing LICENSE → error', () => {
    const r = checkFiles(files('README.md', '.gitignore'));
    assert.equal(r.find(x => x.name === 'LICENSE').ok, false);
  });

  it('missing .gitignore → error', () => {
    const r = checkFiles(files('README.md', 'LICENSE'));
    assert.equal(r.find(x => x.name === '.gitignore').ok, false);
  });

  it('missing CHANGELOG → warn not error', () => {
    const r = checkFiles(files('README.md', 'LICENSE', '.gitignore'));
    const cl = r.find(x => x.name === 'CHANGELOG');
    assert.equal(cl.ok, false);
    assert.equal(cl.level, 'warn');
  });

  it('noChangelog skips CHANGELOG check', () => {
    const r = checkFiles(files('README.md', 'LICENSE', '.gitignore'), { noChangelog: true });
    assert.equal(r.find(x => x.name === 'CHANGELOG'), undefined);
  });

  it('accepts alternative extensions (readme.rst)', () => {
    const r = checkFiles(files('README.rst', 'LICENSE.txt', '.gitignore', 'CHANGELOG'));
    assert.ok(r.every(x => x.ok));
  });
});

// ── checkPkgFields ────────────────────────────────────────────────────────────

describe('checkPkgFields', () => {
  function pkg(obj) { return JSON.stringify(obj); }

  it('all required fields present → all ok', () => {
    const { results } = checkPkgFields(pkg({ name: 'foo', version: '1.0.0', description: 'desc', license: 'MIT' }));
    assert.ok(results.filter(r => r.level === 'required').every(r => r.ok));
  });

  it('missing description → error', () => {
    const { results } = checkPkgFields(pkg({ name: 'foo', version: '1.0.0', license: 'MIT' }));
    assert.equal(results.find(r => r.field === 'description').ok, false);
  });

  it('empty string description → error', () => {
    const { results } = checkPkgFields(pkg({ name: 'foo', version: '1.0.0', description: '', license: 'MIT' }));
    assert.equal(results.find(r => r.field === 'description').ok, false);
  });

  it('whitespace-only description → error', () => {
    const { results } = checkPkgFields(pkg({ name: 'foo', version: '1.0.0', description: '   ', license: 'MIT' }));
    assert.equal(results.find(r => r.field === 'description').ok, false);
  });

  it('numeric version field → error (must be string)', () => {
    const { results } = checkPkgFields(pkg({ name: 'foo', version: 1, description: 'x', license: 'MIT' }));
    assert.equal(results.find(r => r.field === 'version').ok, false);
  });

  it('repository present → warn ok', () => {
    const { results } = checkPkgFields(pkg({ name: 'a', version: '1.0.0', description: 'd', license: 'MIT', repository: { url: 'https://github.com/x/y' } }));
    assert.equal(results.find(r => r.field === 'repository').ok, true);
  });

  it('repository missing → warn not ok', () => {
    const { results } = checkPkgFields(pkg({ name: 'a', version: '1.0.0', description: 'd', license: 'MIT' }));
    assert.equal(results.find(r => r.field === 'repository').level, 'warn');
    assert.equal(results.find(r => r.field === 'repository').ok, false);
  });

  it('invalid JSON → error property', () => {
    const { error } = checkPkgFields('not json');
    assert.ok(error != null);
  });
});

// ── checkPyprojectFields ──────────────────────────────────────────────────────

describe('checkPyprojectFields', () => {
  const minimal = `[project]\nname = "foo"\nversion = "1.0.0"\ndescription = "A tool"\n`;

  it('all required fields → all ok', () => {
    const { results } = checkPyprojectFields(minimal);
    assert.ok(results.filter(r => r.level === 'required').every(r => r.ok));
  });

  it('missing description → error', () => {
    const c = `[project]\nname = "foo"\nversion = "1.0.0"\n`;
    const { results } = checkPyprojectFields(c);
    assert.equal(results.find(r => r.field === 'description').ok, false);
  });

  it('no [project] section → returns error', () => {
    const { error } = checkPyprojectFields('[tool.ruff]\nline-length = 88\n');
    assert.ok(error != null);
  });

  it('license = { text = "MIT" } → warn ok', () => {
    const c = minimal + 'license = { text = "MIT" }\n';
    const { results } = checkPyprojectFields(c);
    assert.equal(results.find(r => r.field === 'license').ok, true);
  });

  it('license = "MIT" → warn ok', () => {
    const c = minimal + 'license = "MIT"\n';
    const { results } = checkPyprojectFields(c);
    assert.equal(results.find(r => r.field === 'license').ok, true);
  });

  it('license missing → warn not ok', () => {
    const { results } = checkPyprojectFields(minimal);
    assert.equal(results.find(r => r.field === 'license').ok, false);
    assert.equal(results.find(r => r.field === 'license').level, 'warn');
  });

  it('single quotes accepted', () => {
    const c = "[project]\nname = 'foo'\nversion = '1.0.0'\ndescription = 'desc'\n";
    const { results } = checkPyprojectFields(c);
    assert.ok(results.filter(r => r.level === 'required').every(r => r.ok));
  });

  it('fields before next section are captured', () => {
    const c = `[project]\nname = "foo"\nversion = "1.0.0"\ndescription = "desc"\n\n[tool.ruff]\nversion = "ignored"\n`;
    const { results } = checkPyprojectFields(c);
    assert.equal(results.find(r => r.field === 'name').value, 'foo');
  });
});

// ── checkRepo ─────────────────────────────────────────────────────────────────

describe('checkRepo', () => {
  const goodFiles  = ['README.md', 'LICENSE', '.gitignore', 'CHANGELOG.md', 'package.json'];
  const goodPkg    = JSON.stringify({ name: 'x', version: '1.0.0', description: 'desc', license: 'MIT', repository: { url: 'u' } });

  it('clean repo → ok=true, no errors, no warnings', () => {
    const r = checkRepo(goodFiles, goodPkg, 'package');
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });

  it('missing README → error', () => {
    const r = checkRepo(['LICENSE', '.gitignore', 'CHANGELOG.md'], goodPkg, 'package');
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.includes('README')));
  });

  it('missing CHANGELOG → warning not error', () => {
    const r = checkRepo(['README.md', 'LICENSE', '.gitignore'], goodPkg, 'package');
    assert.equal(r.ok, true);
    assert.ok(r.warnings.some(w => w.includes('CHANGELOG')));
  });

  it('strict=true: warnings become errors for ok=false', () => {
    const r = checkRepo(['README.md', 'LICENSE', '.gitignore'], goodPkg, 'package', { strict: true });
    assert.equal(r.ok, false);
  });

  it('noFields skips manifest field checks', () => {
    const r = checkRepo(goodFiles, '{}', 'package', { noFields: true });
    assert.equal(r.fieldResults.length, 0);
  });

  it('noChangelog skips CHANGELOG warning', () => {
    const r = checkRepo(['README.md', 'LICENSE', '.gitignore'], goodPkg, 'package', { noChangelog: true });
    assert.ok(!r.warnings.some(w => w.includes('CHANGELOG')));
  });

  it('null manifestContent → no field checks', () => {
    const r = checkRepo(goodFiles, null, null);
    assert.equal(r.fieldResults.length, 0);
  });

  it('manifest parse error → recorded in errors', () => {
    const r = checkRepo(goodFiles, 'bad json', 'package');
    assert.ok(r.manifestError != null);
  });
});
