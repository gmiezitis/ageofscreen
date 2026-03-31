# Package Size Guide

SnipFocus now ships with aggressive packaging excludes so the production app stays focused on the core `Record -> Trim -> Style -> Export` flow.

## Audit the packaged app

Run this after any Windows package build:

```powershell
npm run audit:package-size
```

The audit reports:

- unpacked app folder size
- `app.asar` size
- top-level packaged paths
- largest packaged files

It fails if repo-only paths such as `src/`, `.agent/`, `.cursor/`, logs, or build config files are present in the shipped app.

## Clean local build artifacts

If your workspace grows after packaging, remove the generated artifacts:

```powershell
Remove-Item -Recurse -Force out,.webpack -ErrorAction SilentlyContinue
```

That removes only generated package/build output and leaves source files untouched.
