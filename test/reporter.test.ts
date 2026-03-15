import { describe, it, expect } from 'vitest';
import { buildResult, formatText, formatGitHubActions } from '../src/reporter.js';
import type { ScanResult, ValidationResult } from '../src/types.js';

function makeScan(pkg: string, file = 'AGENTS.md', line = 1): ScanResult {
  return { file, line, command: `npm install ${pkg}`, packages: [pkg] };
}

describe('buildResult', () => {
  it('maps unpublished correctly', () => {
    const scans: ScanResult[] = [makeScan('removed-pkg')];
    const validations: ValidationResult[] = [
      { name: 'removed-pkg', exists: false, httpStatus: 404, isUnpublished: true },
    ];
    const result = buildResult(scans, validations, 1);
    expect(result.packages.unpublished).toBe(1);
    expect(result.packages.notFound).toBe(0);
    expect(result.findings[0].status).toBe('unpublished');
  });

  it('maps plain not_found when not unpublished', () => {
    const scans: ScanResult[] = [makeScan('fake-pkg')];
    const validations: ValidationResult[] = [
      { name: 'fake-pkg', exists: false, httpStatus: 404 },
    ];
    const result = buildResult(scans, validations, 1);
    expect(result.packages.notFound).toBe(1);
    expect(result.packages.unpublished).toBe(0);
    expect(result.findings[0].status).toBe('not_found');
  });
});

describe('formatText', () => {
  it('renders unpublished findings', () => {
    const scans: ScanResult[] = [makeScan('removed-pkg')];
    const validations: ValidationResult[] = [
      { name: 'removed-pkg', exists: false, httpStatus: 404, isUnpublished: true },
    ];
    const result = buildResult(scans, validations, 1);
    const text = formatText(result);
    expect(text).toContain('unpublished from npm (takeover risk)');
    expect(text).toContain('1 unpublished');
    expect(text).toContain('Exit code 1');
  });

  it('counts both unpublished and not_found as phantom packages', () => {
    const scans: ScanResult[] = [makeScan('removed-pkg'), makeScan('fake-pkg')];
    const validations: ValidationResult[] = [
      { name: 'removed-pkg', exists: false, httpStatus: 404, isUnpublished: true },
      { name: 'fake-pkg', exists: false, httpStatus: 404 },
    ];
    const result = buildResult(scans, validations, 1);
    const text = formatText(result);
    expect(text).toContain('Found 2 phantom packages');
  });
});

describe('formatGitHubActions', () => {
  it('emits error level for unpublished packages', () => {
    const scans: ScanResult[] = [makeScan('removed-pkg')];
    const validations: ValidationResult[] = [
      { name: 'removed-pkg', exists: false, httpStatus: 404, isUnpublished: true },
    ];
    const result = buildResult(scans, validations, 1);
    const output = formatGitHubActions(result);
    expect(output).toContain('::error');
    expect(output).toContain('unpublished from npm (takeover risk)');
  });
});
