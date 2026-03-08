import type { ValidationResult } from './types.js';

const REGISTRY_BASE = 'https://registry.npmjs.org';
const REQUEST_TIMEOUT = 10_000;
const MAX_RETRIES = 3;

function packageUrl(name: string): string {
  if (name.startsWith('@')) {
    // Scoped package: @scope/name → @scope%2fname
    return `${REGISTRY_BASE}/${name.replace('/', '%2f')}`;
  }
  return `${REGISTRY_BASE}/${name}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkPackage(name: string): Promise<ValidationResult> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(packageUrl(name), {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 200) {
        return { name, exists: true, httpStatus: 200 };
      }

      if (response.status === 404) {
        return { name, exists: false, httpStatus: 404 };
      }

      if (response.status === 451) {
        return { name, exists: true, httpStatus: 451, isSecurityHold: true };
      }

      if (response.status === 429) {
        // Rate limited — backoff and retry
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        lastError = `Rate limited (429)`;
        continue;
      }

      return { name, exists: false, httpStatus: response.status, error: `HTTP ${response.status}` };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    }
  }

  return { name, exists: false, error: lastError };
}

export async function validatePackages(
  names: string[],
  options?: { concurrency?: number },
): Promise<ValidationResult[]> {
  const concurrency = options?.concurrency ?? 10;

  // Deduplicate
  const unique = [...new Set(names)];
  const results = new Map<string, ValidationResult>();

  // Process in batches with concurrency limit
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(name => checkPackage(name)));
    for (const result of batchResults) {
      results.set(result.name, result);
    }
  }

  // Return results in the order of the original (deduplicated) names
  return unique.map(name => results.get(name)!);
}
