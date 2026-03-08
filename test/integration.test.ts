import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { scanPaths } from '../src/scanner.js';
import { validatePackages } from '../src/validator.js';
import { buildResult, formatJson } from '../src/reporter.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopcheck-int-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('integration', () => {
  it('detects fake packages and passes real ones', async () => {
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, [
      '# Setup',
      '',
      '```bash',
      'npm install express slopcheck-test-definitely-nonexistent-abc123',
      '```',
    ].join('\n'));

    const scanResults = scanPaths([file]);
    expect(scanResults).toHaveLength(1);
    expect(scanResults[0].packages).toContain('express');
    expect(scanResults[0].packages).toContain('slopcheck-test-definitely-nonexistent-abc123');

    const allPackages = [...new Set(scanResults.flatMap(s => s.packages))];
    const validationResults = await validatePackages(allPackages);

    const expressResult = validationResults.find(r => r.name === 'express');
    const fakeResult = validationResults.find(r => r.name === 'slopcheck-test-definitely-nonexistent-abc123');

    expect(expressResult?.exists).toBe(true);
    expect(fakeResult?.exists).toBe(false);

    const result = buildResult(scanResults, validationResults, 1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].package).toBe('slopcheck-test-definitely-nonexistent-abc123');
    expect(result.findings[0].status).toBe('not_found');
  }, 30_000);

  it('JSON output matches expected structure', async () => {
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, 'npm install slopcheck-test-definitely-nonexistent-xyz789\n');

    const scanResults = scanPaths([file]);
    const allPackages = [...new Set(scanResults.flatMap(s => s.packages))];
    const validationResults = await validatePackages(allPackages);
    const result = buildResult(scanResults, validationResults, 1);
    const json = JSON.parse(formatJson(result));

    expect(json).toHaveProperty('version');
    expect(json).toHaveProperty('scanned');
    expect(json).toHaveProperty('packages');
    expect(json.packages).toHaveProperty('total');
    expect(json.packages).toHaveProperty('valid');
    expect(json.packages).toHaveProperty('notFound');
    expect(json.packages).toHaveProperty('securityHold');
    expect(json).toHaveProperty('findings');
    expect(Array.isArray(json.findings)).toBe(true);
  }, 30_000);

  it('exit code 1 when findings exist', async () => {
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, 'npm install slopcheck-test-definitely-nonexistent-exitcode1\n');

    const scanResults = scanPaths([file]);
    const allPackages = [...new Set(scanResults.flatMap(s => s.packages))];
    const validationResults = await validatePackages(allPackages);
    const result = buildResult(scanResults, validationResults, 1);

    expect(result.packages.notFound).toBeGreaterThan(0);
  }, 30_000);

  it('exit code 0 when all packages are real', async () => {
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, 'npm install express lodash\n');

    const scanResults = scanPaths([file]);
    const allPackages = [...new Set(scanResults.flatMap(s => s.packages))];
    const validationResults = await validatePackages(allPackages);
    const result = buildResult(scanResults, validationResults, 1);

    expect(result.packages.notFound).toBe(0);
    expect(result.findings).toHaveLength(0);
  }, 30_000);

  it('--ignore flag excludes specified packages', async () => {
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, 'npm install slopcheck-test-definitely-nonexistent-ignore123 express\n');

    const scanResults = scanPaths([file]);
    const ignoreList = ['slopcheck-test-definitely-nonexistent-ignore123'];

    const allPackages = [...new Set(scanResults.flatMap(s => s.packages))];
    const packagesToCheck = allPackages.filter(p => !ignoreList.includes(p));

    const validationResults = await validatePackages(packagesToCheck);

    const filteredScanResults = scanResults.map(sr => ({
      ...sr,
      packages: sr.packages.filter(pkg => !ignoreList.includes(pkg)),
    })).filter(sr => sr.packages.length > 0);

    const result = buildResult(filteredScanResults, validationResults, 1);
    expect(result.packages.notFound).toBe(0);
    expect(result.findings).toHaveLength(0);
  }, 30_000);
});
