# Contributing to slopcheck

## Setup

```bash
git clone https://github.com/mattschaller/slopcheck.git
cd slopcheck
npm install
```

## Development

```bash
# Run unit tests
npm test

# Run integration tests (requires network)
npm run test:integration

# Build
npm run build

# Test CLI manually
echo 'npm install express fake-pkg-abc123' > test.md
node dist/index.js test.md
```

## Adding new patterns

1. Add the new install command pattern to `src/scanner.ts` (the `INSTALL_PATTERN` regex and `extractCommandsFromLine` patterns).
2. Update `src/extractor.ts` if the new package manager has different argument parsing rules.
3. Add test cases in `test/extractor.test.ts` and `test/scanner.test.ts`.
4. Run `npm test` to verify.

## Submitting changes

1. Fork the repository.
2. Create a branch: `git checkout -b my-feature`.
3. Make your changes and add tests.
4. Run `npm test` — all tests must pass.
5. Run `npm run build` — must compile cleanly.
6. Open a pull request.

## Guidelines

- Zero runtime dependencies. Use only Node.js built-in APIs.
- Keep it simple. This tool does one thing well.
- Every new pattern needs a test case.
