# slopcheck

Scan markdown and config files for hallucinated npm package names. Zero runtime dependencies.

## Setup

```bash
npm install
npm run build
```

## Testing

```bash
npm test                           # unit tests (vitest)
npm run test:integration           # integration tests (hits live npm registry)
```

## Architecture

```
src/
  index.ts       — CLI entry point, arg parsing, orchestration
  scanner.ts     — file discovery + install-command extraction
  extractor.ts   — package name parsing from shell commands
  validator.ts   — npm registry validation (HEAD requests + downloads API)
  reporter.ts    — result formatting (text, JSON, GitHub Actions annotations)
  types.ts       — shared TypeScript interfaces
test/
  *.test.ts      — unit tests (vitest)
  integration.test.ts — end-to-end tests against live registry
```

## Conventions

- **VERSION constants**: `src/reporter.ts` and `src/index.ts` both have a `VERSION` constant. These must stay in sync with `package.json` version.
- **Zero dependencies**: no runtime deps. Only devDependencies for build/test tooling.
- **File types scanned**: `.md`, `.mdc`, `.yaml`, `.yml`, `.json`, `.cursorrules`
- **Directories skipped**: `node_modules`, `.git`, `dist`, `build`
