# repogap

Zero-dependency CLI to check a repository for missing files and manifest fields — before you open-source it, add CI, or hand it off.

```
$ repogap

  ✓ README.md
  ✓ LICENSE
  ✓ .gitignore
  ! CHANGELOG  missing (recommended)

  package.json
    ✓ name         my-tool
    ✓ version      1.0.0
    ✗ description  missing or empty
    ✓ license      MIT
    ! repository   missing

repogap: drift detected — 1 error, 2 warnings
```

## Install

```bash
# Node — no install needed
npx repogap

# Python
pip install repogap
repogap
```

No dependencies. Node ≥ 18 / Python ≥ 3.8.

## Usage

```bash
repogap [options] [dir]
```

| Option | Description |
|--------|-------------|
| `--strict` | Treat warnings as errors (exit 1) |
| `--no-changelog` | Skip CHANGELOG check |
| `--no-fields` | Skip manifest field checks |
| `--json` | Machine-readable output |
| `--version` | Print version |
| `--help` | Show help |

**Exit codes:** `0` clean · `1` issues found · `2` error

## Checks

| Source | Level | Notes |
|--------|-------|-------|
| README | required | accepts `.md`, `.rst`, `.txt`, bare |
| LICENSE | required | accepts `LICENCE`, `COPYING`, `.txt`, `.md` |
| .gitignore | required | |
| CHANGELOG | warn | accepts `.md`, `.rst`, bare, `HISTORY.md` |
| `name`, `version`, `description`, `license` | required | from `package.json` or `pyproject.toml` |
| `repository` | warn | `package.json` only |

## CI

```yaml
- name: Check repo hygiene
  run: npx repogap
```

For the Python counterpart, see [repogap-py](https://github.com/jjdoor/repogap-py).

## License

MIT
