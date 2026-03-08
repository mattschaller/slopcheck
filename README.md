# slopcheck

**Catch hallucinated npm packages before they catch you.**

[![npm version](https://img.shields.io/npm/v/slopcheck)](https://www.npmjs.com/package/slopcheck)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The problem

AI coding agents hallucinate package names. According to [USENIX Security 2025 research](https://arxiv.org/abs/2406.10279), ~20% of AI-generated code references packages that don't exist on npm. 58% of these hallucinated names recur consistently across prompts, making them predictable squat targets. Attackers register these phantom names as malware and wait for installs.

Real incident: [wshobson/agents](https://github.com/wshobson/agents) (Oct 2025) committed 47 LLM-generated skill files containing `npx react-codeshift` — a non-existent package. A researcher claimed the npm name on Jan 14, 2026. 237 repos had already referenced it.

Your `AGENTS.md`, `SKILL.md`, `.cursorrules`, and documentation files are attack surfaces.

## What slopcheck does

Scans markdown, YAML, and JSON files for install commands (`npm install`, `npx`, `pnpm add`, `yarn add`, `bun add`, `bunx`) → extracts package names → validates each against the live npm registry → reports phantom packages.

Zero runtime dependencies. Uses only Node.js built-in APIs.

## Quickstart

```bash
# Scan current directory
npx slopcheck .

# Install globally
npm install -g slopcheck
slopcheck ./docs ./AGENTS.md
```

## GitHub Action

```yaml
- uses: mattschaller/slopcheck@v0.1.0
  with:
    paths: '. docs/'
```

```yaml
# Full example
name: Slopsquatting Check
on: [push, pull_request]
jobs:
  slopcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mattschaller/slopcheck@v0.1.0
        with:
          paths: '.'
          ignore: 'my-internal-pkg,another-known-pkg'
          concurrency: '10'
```

When running as a GitHub Action, slopcheck outputs findings as workflow annotations that appear directly on the PR diff.

## CLI options

```
Usage: slopcheck [options] [files/directories...]

Options:
  -V, --version        output version
  --json               output JSON instead of text
  --concurrency <n>    max concurrent registry checks (default: 10)
  --ignore <packages>  comma-separated list of packages to skip
  --no-security-hold   don't flag security holds as warnings
  -h, --help           display help

Arguments:
  files/directories    files or directories to scan (default: current directory)
                       directories are scanned recursively for .md, .yml, .yaml,
                       .json, .cursorrules files
                       node_modules, .git, dist, build directories are always excluded
```

## What it catches

| Attack vector | How it works | slopcheck defense |
|---|---|---|
| Hallucinated package in AGENTS.md | AI generates `npx react-codeshift`, attacker registers the name | Detects `react-codeshift` doesn't exist on npm |
| Hallucinated dependency in README | Developer copies `npm install phantom-pkg` from docs | Flags `phantom-pkg` as not found |
| AI-generated SKILL.md with phantom packages | Spread across 237+ repos via copy/paste | Catches all non-existent package references |
| Security-held packages | Package removed by npm for malware (HTTP 451) | Flags with security hold warning |

### Example output

```
slopcheck v0.1.0 — scanning 3 files for phantom packages

✗ react-codeshift — not found on npm
  └─ AGENTS.md:14  npx react-codeshift --transform ...
  └─ SKILL.md:8    npm install react-codeshift

⚠ suspicious-pkg — security hold (HTTP 451)
  └─ .cursorrules:19  npm install suspicious-pkg

✓ 12 packages verified, 1 not found, 1 security hold

Found 1 phantom package. Exit code 1.
```

## What it doesn't catch

Honesty builds trust:

- **Doesn't scan package.json or lock files.** Use [Socket.dev](https://socket.dev/) or [Snyk](https://snyk.io/) for dependency analysis.
- **Doesn't check if an existing package is malicious.** Use [@aikidosec/safe-chain](https://www.npmjs.com/package/@aikidosec/safe-chain) for runtime install protection.
- **Only checks if the package name exists on npm.** A package existing doesn't mean it's safe — it means it's not a hallucination.

## Prior art and references

- [USENIX Security 2025 — "We Have a Package for You!"](https://arxiv.org/abs/2406.10279) — 576K code samples, 16 models, ~20% hallucinated package names
- [Aikido Blog — Slopsquatting](https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks) — attack vector analysis
- [Aikido Blog — Agent Skills Spreading Hallucinated npx Commands](https://www.aikido.dev/blog/agent-skills-spreading-hallucinated-npx-commands) — wshobson/agents incident, 237 repos, `npx react-codeshift`
- [HackerOne — Slopsquatting: AI and Supply Chain Security](https://www.hackerone.com/blog/ai-slopsquatting-supply-chain-security) — industry impact
- [Trend Micro — Slopsquatting: When AI Agents Hallucinate Malicious Packages](https://www.trendmicro.com/vinfo/us/security/news/cybercrime-and-digital-threats/slopsquatting-when-ai-agents-hallucinate-malicious-packages) — supply chain attack patterns

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
