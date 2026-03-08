import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanFile, scanPaths, findFiles } from '../src/scanner.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopcheck-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('scanFile', () => {
  it('finds npm install in markdown code block', () => {
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, '# Setup\n\n```bash\nnpm install foo\n```\n');
    const results = scanFile(file);
    expect(results).toHaveLength(1);
    expect(results[0].packages).toEqual(['foo']);
    expect(results[0].line).toBe(4);
  });

  it('finds npm install in markdown prose', () => {
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, 'Run `npm install bar` to get started.\n');
    const results = scanFile(file);
    expect(results).toHaveLength(1);
    expect(results[0].packages).toEqual(['bar']);
  });

  it('finds commands in YAML files', () => {
    const file = path.join(tmpDir, 'test.yml');
    fs.writeFileSync(file, 'steps:\n  - run: npm install baz\n');
    const results = scanFile(file);
    expect(results).toHaveLength(1);
    expect(results[0].packages).toEqual(['baz']);
  });

  it('finds commands in JSON files', () => {
    const file = path.join(tmpDir, 'test.json');
    fs.writeFileSync(file, '{\n  "test": "npx vitest"\n}\n');
    const results = scanFile(file);
    expect(results).toHaveLength(1);
    expect(results[0].packages).toEqual(['vitest']);
  });

  it('returns empty for files with no install commands', () => {
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, '# Hello\n\nThis is just text.\n');
    const results = scanFile(file);
    expect(results).toHaveLength(0);
  });

  it('finds multiple commands on different lines', () => {
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, 'npm install foo\nsome text\nnpm install bar\n');
    const results = scanFile(file);
    expect(results).toHaveLength(2);
    expect(results[0].packages).toEqual(['foo']);
    expect(results[1].packages).toEqual(['bar']);
  });

  it('scans .cursorrules files', () => {
    const file = path.join(tmpDir, '.cursorrules');
    fs.writeFileSync(file, 'Use npm install my-pkg for setup.\n');
    const results = scanFile(file);
    expect(results).toHaveLength(1);
    expect(results[0].packages).toEqual(['my-pkg']);
  });
});

describe('findFiles', () => {
  it('finds files recursively', () => {
    const subDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '');
    fs.writeFileSync(path.join(subDir, 'setup.md'), '');
    const files = findFiles(tmpDir);
    expect(files).toHaveLength(2);
  });

  it('skips node_modules, .git, dist directories', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.mkdirSync(path.join(tmpDir, 'dist'));
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg.md'), '');
    fs.writeFileSync(path.join(tmpDir, '.git', 'config.yml'), '');
    fs.writeFileSync(path.join(tmpDir, 'dist', 'out.json'), '');
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '');
    const files = findFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('readme.md');
  });
});

describe('scanPaths', () => {
  it('scans directories recursively', () => {
    const subDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), 'npm install foo\n');
    fs.writeFileSync(path.join(subDir, 'setup.md'), 'npm install bar\n');
    const results = scanPaths([tmpDir]);
    expect(results).toHaveLength(2);
  });
});
