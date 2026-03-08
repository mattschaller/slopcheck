import type { ScanResult, ValidationResult, Finding, SlopcheckResult } from './types.js';

const VERSION = '0.1.0';

export function buildResult(
  scanResults: ScanResult[],
  validationResults: ValidationResult[],
  scannedFileCount: number,
  options: { noSecurityHold?: boolean } = {},
): SlopcheckResult {
  const validationMap = new Map<string, ValidationResult>();
  for (const vr of validationResults) {
    validationMap.set(vr.name, vr);
  }

  // Build findings grouped by package
  const findingsMap = new Map<string, Finding>();

  for (const scan of scanResults) {
    for (const pkg of scan.packages) {
      const validation = validationMap.get(pkg);
      if (!validation) continue;

      let status: Finding['status'] | null = null;

      if (!validation.exists && !validation.error) {
        status = 'not_found';
      } else if (validation.isSecurityHold && !options.noSecurityHold) {
        status = 'security_hold';
      } else if (validation.error) {
        status = 'error';
      }

      if (!status) continue;

      if (!findingsMap.has(pkg)) {
        findingsMap.set(pkg, { package: pkg, status, locations: [] });
      }

      const finding = findingsMap.get(pkg)!;
      // Avoid duplicate locations
      const locKey = `${scan.file}:${scan.line}`;
      if (!finding.locations.some(l => `${l.file}:${l.line}` === locKey)) {
        finding.locations.push({
          file: scan.file,
          line: scan.line,
          command: scan.command,
        });
      }
    }
  }

  const findings = [...findingsMap.values()];
  const allPackages = new Set<string>();
  for (const scan of scanResults) {
    for (const pkg of scan.packages) {
      allPackages.add(pkg);
    }
  }

  const notFoundCount = findings.filter(f => f.status === 'not_found').length;
  const securityHoldCount = findings.filter(f => f.status === 'security_hold').length;
  const errorCount = findings.filter(f => f.status === 'error').length;

  return {
    version: VERSION,
    scanned: scannedFileCount,
    packages: {
      total: allPackages.size,
      valid: allPackages.size - notFoundCount - securityHoldCount - errorCount,
      notFound: notFoundCount,
      securityHold: securityHoldCount,
      errors: errorCount,
    },
    findings,
  };
}

export function formatText(result: SlopcheckResult): string {
  const lines: string[] = [];

  lines.push(`slopcheck v${result.version} — scanning ${result.scanned} file${result.scanned !== 1 ? 's' : ''} for phantom packages`);
  lines.push('');

  // Not found
  for (const finding of result.findings.filter(f => f.status === 'not_found')) {
    lines.push(`✗ ${finding.package} — not found on npm`);
    for (const loc of finding.locations) {
      lines.push(`  └─ ${loc.file}:${loc.line}  ${loc.command}`);
    }
    lines.push('');
  }

  // Security holds
  for (const finding of result.findings.filter(f => f.status === 'security_hold')) {
    lines.push(`⚠ ${finding.package} — security hold (HTTP 451)`);
    for (const loc of finding.locations) {
      lines.push(`  └─ ${loc.file}:${loc.line}  ${loc.command}`);
    }
    lines.push('');
  }

  // Errors
  for (const finding of result.findings.filter(f => f.status === 'error')) {
    lines.push(`? ${finding.package} — validation error`);
    for (const loc of finding.locations) {
      lines.push(`  └─ ${loc.file}:${loc.line}  ${loc.command}`);
    }
    lines.push('');
  }

  // Summary
  const parts: string[] = [];
  parts.push(`${result.packages.valid} packages verified`);
  if (result.packages.notFound > 0) parts.push(`${result.packages.notFound} not found`);
  if (result.packages.securityHold > 0) parts.push(`${result.packages.securityHold} security hold`);
  if (result.packages.errors > 0) parts.push(`${result.packages.errors} errors`);
  lines.push(`✓ ${parts.join(', ')}`);

  if (result.packages.notFound > 0) {
    lines.push('');
    lines.push(`Found ${result.packages.notFound} phantom package${result.packages.notFound !== 1 ? 's' : ''}. Exit code 1.`);
  }

  return lines.join('\n');
}

export function formatJson(result: SlopcheckResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatGitHubActions(result: SlopcheckResult): string {
  const lines: string[] = [];

  for (const finding of result.findings) {
    for (const loc of finding.locations) {
      const level = finding.status === 'not_found' ? 'error' : 'warning';
      const msg = finding.status === 'not_found'
        ? `Package "${finding.package}" not found on npm (possible slopsquatting target)`
        : finding.status === 'security_hold'
          ? `Package "${finding.package}" is under security hold (HTTP 451)`
          : `Package "${finding.package}" validation error`;
      lines.push(`::${level} file=${loc.file},line=${loc.line}::${msg}`);
    }
  }

  return lines.join('\n');
}
