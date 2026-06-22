'use strict';

// Pure functions only — no FS / network / process.

const README_CANDIDATES   = ['readme.md', 'readme.rst', 'readme.txt', 'readme'];
const LICENSE_CANDIDATES  = ['license', 'license.md', 'license.txt', 'copying', 'licence'];
const GITIGNORE_CANDIDATES = ['.gitignore'];
const CHANGELOG_CANDIDATES = ['changelog.md', 'changelog', 'changelog.rst', 'changelog.txt', 'history.md'];

const PKG_REQUIRED_FIELDS  = ['name', 'version', 'description', 'license'];
const PKG_WARN_FIELDS      = ['repository'];

const PYPROJECT_REQUIRED_FIELDS = ['name', 'version', 'description'];
const PYPROJECT_WARN_FIELDS     = ['license'];

function findFile(filesSet, candidates) {
  for (const c of candidates) {
    if (filesSet.has(c)) return c;
  }
  return null;
}

function checkFiles(filesSet, { noChangelog = false } = {}) {
  const results = [];

  const readmeFound = findFile(filesSet, README_CANDIDATES);
  results.push({ name: 'README', level: 'required', ok: readmeFound != null, found: readmeFound });

  const licenseFound = findFile(filesSet, LICENSE_CANDIDATES);
  results.push({ name: 'LICENSE', level: 'required', ok: licenseFound != null, found: licenseFound });

  const giFound = findFile(filesSet, GITIGNORE_CANDIDATES);
  results.push({ name: '.gitignore', level: 'required', ok: giFound != null, found: giFound });

  if (!noChangelog) {
    const clFound = findFile(filesSet, CHANGELOG_CANDIDATES);
    results.push({ name: 'CHANGELOG', level: 'warn', ok: clFound != null, found: clFound });
  }

  return results;
}

function checkPkgFields(content) {
  let pkg;
  try { pkg = JSON.parse(content); } catch (e) { return { error: `invalid JSON: ${e.message}` }; }
  if (typeof pkg !== 'object' || pkg === null) return { error: 'package.json is not an object' };

  const results = [];
  for (const f of PKG_REQUIRED_FIELDS) {
    const val = pkg[f];
    const ok = typeof val === 'string' && val.trim().length > 0;
    results.push({ field: f, level: 'required', ok, value: ok ? val.trim() : null });
  }
  for (const f of PKG_WARN_FIELDS) {
    const val = pkg[f];
    const ok = val != null && val !== '';
    const display = ok ? (typeof val === 'string' ? val : JSON.stringify(val)) : null;
    results.push({ field: f, level: 'warn', ok, value: display });
  }
  return { results };
}

function checkPyprojectFields(content) {
  if (!/^\[project\]/m.test(content)) {
    return { error: 'no [project] section found in pyproject.toml' };
  }

  const results = [];
  for (const f of PYPROJECT_REQUIRED_FIELDS) {
    // match field inside [project] block (before next section heading)
    const re = new RegExp(`^\\[project\\][^[]*?\\b${f}\\s*=\\s*["']([^"'\\r\\n]+)["']`, 'ms');
    const m = content.match(re);
    const ok = m != null;
    results.push({ field: f, level: 'required', ok, value: ok ? m[1] : null });
  }
  for (const f of PYPROJECT_WARN_FIELDS) {
    // license = { text = "MIT" }  OR  license = "MIT"
    const reInline = new RegExp(`^\\[project\\][^[]*?\\blicense\\s*=\\s*["']([^"'\\r\\n]+)["']`, 'ms');
    const reTable  = new RegExp(`^\\[project\\][^[]*?\\blicense\\s*=\\s*\\{[^}]*text\\s*=\\s*["']([^"']+)["']`, 'ms');
    const m = content.match(reInline) || content.match(reTable);
    const ok = m != null;
    results.push({ field: f, level: 'warn', ok, value: ok ? m[1] : null });
  }
  return { results };
}

function checkRepo(fileList, manifestContent, manifestType, options = {}) {
  const { strict = false, noChangelog = false, noFields = false } = options;
  const filesSet = new Set(fileList.map(f => f.toLowerCase()));

  const fileResults = checkFiles(filesSet, { noChangelog });

  let fieldResults = [];
  let manifestError = null;
  if (!noFields && manifestContent != null && manifestType != null) {
    const { results, error } = manifestType === 'package'
      ? checkPkgFields(manifestContent)
      : checkPyprojectFields(manifestContent);
    if (error) {
      manifestError = error;
    } else {
      fieldResults = results || [];
    }
  }

  const errors = [
    ...fileResults.filter(r => r.level === 'required' && !r.ok).map(r => `${r.name} not found`),
    ...(manifestError ? [`manifest: ${manifestError}`] : []),
    ...fieldResults.filter(r => r.level === 'required' && !r.ok).map(r => `${r.field} missing or empty`),
  ];

  const warnings = [
    ...fileResults.filter(r => r.level === 'warn' && !r.ok).map(r => `${r.name} not found`),
    ...fieldResults.filter(r => r.level === 'warn' && !r.ok).map(r => `${r.field} missing`),
  ];

  const ok = errors.length === 0 && (!strict || warnings.length === 0);

  return { ok, errors, warnings, fileResults, fieldResults, manifestError };
}

module.exports = { checkFiles, checkPkgFields, checkPyprojectFields, checkRepo, findFile };
