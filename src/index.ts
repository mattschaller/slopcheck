import { scanPaths } from './scanner.js';
import { validatePackages } from './validator.js';
import { buildResult, formatText, formatJson, formatGitHubActions } from './reporter.js';
import type { CLIOptions } from './types.js';

export { scanPaths } from './scanner.js';
export { extractPackageNames } from './extractor.js';
export { validatePackages } from './validator.js';
export { buildResult, formatText, formatJson, formatGitHubActions } from './reporter.js';
export type { ScanResult, ValidationResult, Finding, SlopcheckResult, CLIOptions } from './types.js';

const VERSION = '0.2.0';

function printHelp(): void {
  console.log(`slopcheck v${VERSION} — Catch hallucinated npm packages before they catch you.

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
                       directories are scanned recursively for .md, .mdc, .yml, .yaml, .json, .cursorrules files
                       node_modules, .git, dist, build directories are always excluded`);
}

function parseArgs(argv: string[]): CLIOptions {
  const options: CLIOptions = {
    paths: [],
    json: false,
    concurrency: 10,
    ignore: [],
    noSecurityHold: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case '-V':
      case '--version':
        console.log(VERSION);
        process.exit(0);
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      case '--json':
        options.json = true;
        break;
      case '--concurrency':
        i++;
        options.concurrency = parseInt(argv[i], 10);
        if (isNaN(options.concurrency) || options.concurrency < 1) {
          console.error('Error: --concurrency must be a positive integer');
          process.exit(2);
        }
        break;
      case '--ignore':
        i++;
        if (argv[i]) {
          options.ignore = argv[i].split(',').map(s => s.trim()).filter(Boolean);
        }
        break;
      case '--no-security-hold':
        options.noSecurityHold = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(2);
        }
        options.paths.push(arg);
        break;
    }
    i++;
  }

  if (options.paths.length === 0) {
    options.paths = ['.'];
  }

  return options;
}

function getGitHubActionInputs(): Partial<CLIOptions> | null {
  // Check if running as GitHub Action
  const githubActions = process.env.GITHUB_ACTIONS === 'true';
  if (!githubActions) return null;

  const inputs: Partial<CLIOptions> = {};

  const paths = process.env.INPUT_PATHS;
  if (paths) {
    inputs.paths = paths.split(/\s+/).filter(Boolean);
  }

  const ignore = process.env.INPUT_IGNORE;
  if (ignore) {
    inputs.ignore = ignore.split(',').map(s => s.trim()).filter(Boolean);
  }

  const concurrency = process.env.INPUT_CONCURRENCY;
  if (concurrency) {
    const n = parseInt(concurrency, 10);
    if (!isNaN(n) && n > 0) {
      inputs.concurrency = n;
    }
  }

  return inputs;
}

async function main(): Promise<void> {
  const cliOptions = parseArgs(process.argv.slice(2));

  // Merge GitHub Action inputs (they override defaults but CLI args take precedence)
  const actionInputs = getGitHubActionInputs();
  if (actionInputs) {
    if (actionInputs.paths && cliOptions.paths.length === 1 && cliOptions.paths[0] === '.') {
      cliOptions.paths = actionInputs.paths;
    }
    if (actionInputs.ignore && cliOptions.ignore.length === 0) {
      cliOptions.ignore = actionInputs.ignore;
    }
    if (actionInputs.concurrency !== undefined) {
      cliOptions.concurrency = actionInputs.concurrency;
    }
  }

  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  // Scan
  const scanResults = scanPaths(cliOptions.paths);

  // Collect unique package names
  const allPackages = new Set<string>();
  for (const scan of scanResults) {
    for (const pkg of scan.packages) {
      allPackages.add(pkg);
    }
  }

  // Remove ignored packages
  const packagesToCheck = [...allPackages].filter(
    pkg => !cliOptions.ignore.includes(pkg),
  );

  // Also filter scan results for reporting
  const filteredScanResults = scanResults.map(sr => ({
    ...sr,
    packages: sr.packages.filter(pkg => !cliOptions.ignore.includes(pkg)),
  })).filter(sr => sr.packages.length > 0);

  // Count scanned files
  const scannedFiles = new Set(scanResults.map(sr => sr.file));

  // Validate
  const validationResults = await validatePackages(packagesToCheck, {
    concurrency: cliOptions.concurrency,
  });

  // Build result
  const result = buildResult(
    filteredScanResults,
    validationResults,
    scannedFiles.size || cliOptions.paths.length,
    { noSecurityHold: cliOptions.noSecurityHold },
  );

  // Output
  if (cliOptions.json) {
    console.log(formatJson(result));
  } else {
    console.log(formatText(result));
  }

  // GitHub Actions annotations
  if (isGitHubActions && result.findings.length > 0) {
    console.log(formatGitHubActions(result));
  }

  // Exit code
  if (result.packages.notFound > 0 || result.packages.unpublished > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(2);
});
