import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractPackageNames } from './extractor.js';
import type { ScanResult } from './types.js';

const INSTALL_PATTERN = /(?:npm\s+(?:install|i|add)|npx|pnpm\s+(?:add|install|i|dlx)|yarn\s+add|bun\s+(?:add|install|i)|bunx)\s/i;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

const SCANNABLE_EXTENSIONS = new Set(['.md', '.yaml', '.yml', '.json', '.cursorrules']);

function getFileType(filePath: string): 'markdown' | 'yaml' | 'json' | 'text' {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();

  if (ext === '.md' || base === '.cursorrules') return 'markdown';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.json') return 'json';
  return 'text';
}

// Matches valid command arguments: package names (including scoped @scope/name),
// flags (-D, --save-dev), version specifiers (@1.0.0), shell operators, and quoted strings.
// Stops at characters that aren't part of shell commands (prose text, backticks, etc.)
const CMD_ARGS = /(?:\s+(?:@[\w.-]+\/[\w.-]+(?:@[\w.*^~<>=|-]+)?|[\w.-]+(?:@[\w.*^~<>=|-]+)?|--?[\w-]+(?:=\S+)?|[|;&>]+))+/;

function extractCommandsFromLine(line: string): string[] {
  const commands: string[] = [];
  const patterns = [
    new RegExp(`npm\\s+(?:install|i|add)${CMD_ARGS.source}`, 'gi'),
    new RegExp(`npx${CMD_ARGS.source}`, 'gi'),
    new RegExp(`pnpm\\s+(?:add|install|i|dlx)${CMD_ARGS.source}`, 'gi'),
    new RegExp(`yarn\\s+add${CMD_ARGS.source}`, 'gi'),
    new RegExp(`bun\\s+(?:add|install|i)${CMD_ARGS.source}`, 'gi'),
    new RegExp(`bunx${CMD_ARGS.source}`, 'gi'),
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      commands.push(match[0].trim());
    }
  }

  return commands;
}

function scanContent(content: string, filePath: string): ScanResult[] {
  const results: ScanResult[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!INSTALL_PATTERN.test(line)) continue;

    const commands = extractCommandsFromLine(line);
    for (const command of commands) {
      const packages = extractPackageNames(command);
      if (packages.length > 0) {
        results.push({
          file: filePath,
          line: i + 1,
          command,
          packages,
        });
      }
    }
  }

  return results;
}

function scanJsonContent(content: string, filePath: string): ScanResult[] {
  const results: ScanResult[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!INSTALL_PATTERN.test(line)) continue;

    // Extract string values from JSON lines
    const stringMatches = line.matchAll(/"([^"]*(?:npm|npx|pnpm|yarn|bun|bunx)[^"]*)"/gi);
    for (const match of stringMatches) {
      const value = match[1];
      const commands = extractCommandsFromLine(value);
      for (const command of commands) {
        const packages = extractPackageNames(command);
        if (packages.length > 0) {
          results.push({
            file: filePath,
            line: i + 1,
            command,
            packages,
          });
        }
      }
    }
  }

  return results;
}

export function scanFile(filePath: string): ScanResult[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const fileType = getFileType(filePath);

  switch (fileType) {
    case 'json':
      return scanJsonContent(content, filePath);
    case 'markdown':
    case 'yaml':
    case 'text':
    default:
      return scanContent(content, filePath);
  }
}

export function findFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(currentDir, entry.name));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const name = entry.name.toLowerCase();
        if (SCANNABLE_EXTENSIONS.has(ext) || name === '.cursorrules') {
          files.push(path.join(currentDir, entry.name));
        }
      }
    }
  }

  walk(dir);
  return files;
}

export function scanPaths(paths: string[]): ScanResult[] {
  const results: ScanResult[] = [];
  const seenFiles = new Set<string>();

  for (const p of paths) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(p);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const files = findFiles(p);
      for (const file of files) {
        const resolved = path.resolve(file);
        if (!seenFiles.has(resolved)) {
          seenFiles.add(resolved);
          results.push(...scanFile(file));
        }
      }
    } else if (stat.isFile()) {
      const resolved = path.resolve(p);
      if (!seenFiles.has(resolved)) {
        seenFiles.add(resolved);
        results.push(...scanFile(p));
      }
    }
  }

  return results;
}
