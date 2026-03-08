const COMMAND_WORDS = new Set([
  'npm', 'npx', 'pnpm', 'yarn', 'bun', 'bunx',
  'install', 'i', 'add', 'dlx',
]);

const FLAG_LIKE = /^-/;
const STOP_TOKENS = new Set(['|', '&&', ';', '>', '>>', '--']);
const SHELL_OPERATORS = /[|;&>]/;

function stripVersion(name: string): string {
  // For scoped packages: @scope/name@version → @scope/name
  if (name.startsWith('@') && name.includes('/')) {
    const slashIdx = name.indexOf('/');
    const afterSlash = name.slice(slashIdx + 1);
    const atIdx = afterSlash.indexOf('@');
    if (atIdx !== -1) {
      return name.slice(0, slashIdx + 1 + atIdx);
    }
    return name;
  }
  // For unscoped packages: name@version → name
  const atIdx = name.indexOf('@');
  if (atIdx > 0) {
    return name.slice(0, atIdx);
  }
  return name;
}

// Valid npm package name characters (no trailing dots/underscores)
const VALID_PKG_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
const VALID_SCOPED_PKG = /^@[a-zA-Z0-9._-]+\/[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^@[a-zA-Z0-9._-]+\/[a-zA-Z0-9]$/;

// Common English words that appear in prose but aren't package names
const PROSE_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do',
  'for', 'from', 'get', 'has', 'have', 'he', 'her', 'him', 'his',
  'how', 'if', 'in', 'into', 'is', 'it', 'its', 'let', 'may', 'me',
  'my', 'no', 'nor', 'not', 'of', 'on', 'or', 'our', 'out', 'own',
  'run', 'say', 'set', 'she', 'so', 'the', 'then', 'this', 'to',
  'up', 'us', 'use', 'was', 'way', 'we', 'were', 'what', 'when',
  'who', 'why', 'will', 'with', 'you', 'your',
  'after', 'before', 'below', 'between', 'both', 'each', 'every',
  'following', 'here', 'just', 'like', 'make', 'more', 'most',
  'need', 'new', 'now', 'only', 'other', 'over', 'should', 'some',
  'such', 'take', 'than', 'that', 'them', 'these', 'they', 'those',
  'through', 'under', 'very', 'want', 'which', 'while', 'would',
  'setup', 'using', 'started', 'getting', 'running', 'file', 'project',
]);

function isPackageName(token: string): boolean {
  if (!token || token.length === 0) return false;
  if (FLAG_LIKE.test(token)) return false;
  if (COMMAND_WORDS.has(token)) return false;
  if (STOP_TOKENS.has(token)) return false;
  if (SHELL_OPERATORS.test(token.charAt(0))) return false;
  if (PROSE_WORDS.has(token.toLowerCase())) return false;
  // Scoped packages start with @scope/
  if (token.startsWith('@')) {
    return VALID_SCOPED_PKG.test(token);
  }
  return VALID_PKG_NAME.test(token);
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    // Backtick ends the command (markdown inline code boundary)
    if (ch === '`') {
      break;
    }

    // Shell operators as separate tokens
    if (ch === '|' || ch === ';' || ch === '>') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      if (ch === '>' && command[i + 1] === '>') {
        tokens.push('>>');
        i++;
      } else {
        tokens.push(ch);
      }
      continue;
    }

    if (ch === '&' && command[i + 1] === '&') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push('&&');
      i++;
      continue;
    }

    current += ch;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function extractPackageNames(command: string): string[] {
  const tokens = tokenize(command.trim());
  if (tokens.length === 0) return [];

  // Determine the package manager and subcommand
  const first = tokens[0];
  const isNpx = first === 'npx' || first === 'bunx' || (first === 'pnpm' && tokens[1] === 'dlx');
  const isBunx = first === 'bunx';

  if (isNpx) {
    return extractNpxPackages(tokens, first === 'pnpm' ? 2 : 1);
  }

  // Regular install/add commands
  return extractInstallPackages(tokens);
}

function extractNpxPackages(tokens: string[], startIdx: number): string[] {
  const packages: string[] = [];
  let i = startIdx;

  // First pass: extract --package=<pkg> and -p <pkg> flags
  while (i < tokens.length) {
    const token = tokens[i];

    if (STOP_TOKENS.has(token) || SHELL_OPERATORS.test(token.charAt(0))) break;

    if (token.startsWith('--package=')) {
      const val = token.slice('--package='.length);
      if (val) packages.push(stripVersion(val));
      i++;
      continue;
    }

    if (token === '-p' || token === '--package') {
      i++;
      if (i < tokens.length && !STOP_TOKENS.has(tokens[i])) {
        packages.push(stripVersion(tokens[i]));
      }
      i++;
      continue;
    }

    if (FLAG_LIKE.test(token)) {
      i++;
      continue;
    }

    // First non-flag, non-package-flag token is the executable package
    const stripped = stripVersion(token);
    if (isPackageName(stripped)) {
      packages.push(stripped);
    }
    // For npx/bunx, only the first non-flag argument is the package
    break;
  }

  return packages;
}

function extractInstallPackages(tokens: string[]): string[] {
  const packages: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (STOP_TOKENS.has(token) || SHELL_OPERATORS.test(token.charAt(0))) break;
    if (COMMAND_WORDS.has(token)) continue;
    if (FLAG_LIKE.test(token)) continue;

    const stripped = stripVersion(token);
    if (isPackageName(stripped)) {
      packages.push(stripped);
    }
  }

  return packages;
}
