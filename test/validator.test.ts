import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validatePackages } from '../src/validator.js';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('validatePackages', () => {
  it('returns exists: true for 200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const results = await validatePackages(['express']);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ name: 'express', exists: true, httpStatus: 200 });
  });

  it('returns exists: false for 404 response', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('api.npmjs.org/downloads')) {
        return { ok: true, json: async () => ({ downloads: 0 }) };
      }
      return { status: 404 };
    });
    const results = await validatePackages(['fake-package']);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ name: 'fake-package', exists: false, httpStatus: 404 });
  });

  it('detects unpublished package (404 + downloads > 0)', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('api.npmjs.org/downloads')) {
        return { ok: true, json: async () => ({ downloads: 1500 }) };
      }
      return { status: 404 };
    });
    const results = await validatePackages(['removed-pkg']);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: 'removed-pkg',
      exists: false,
      httpStatus: 404,
      isUnpublished: true,
    });
  });

  it('falls back to not_found when downloads API fails', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('api.npmjs.org/downloads')) {
        throw new Error('Network error');
      }
      return { status: 404 };
    });
    const results = await validatePackages(['broken-check']);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ name: 'broken-check', exists: false, httpStatus: 404 });
  });

  it('flags security hold for 451 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 451 });
    const results = await validatePackages(['held-package']);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: 'held-package',
      exists: true,
      httpStatus: 451,
      isSecurityHold: true,
    });
  });

  it('handles network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const results = await validatePackages(['error-package']);
    expect(results).toHaveLength(1);
    expect(results[0].exists).toBe(false);
    expect(results[0].error).toBeDefined();
  });

  it('deduplicates packages', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    globalThis.fetch = mockFetch;
    const results = await validatePackages(['express', 'express', 'express']);
    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('encodes scoped package URLs', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    globalThis.fetch = mockFetch;
    await validatePackages(['@types/node']);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('@types%2fnode');
  });

  it('respects concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 50));
      concurrent--;
      return { status: 200 };
    });

    const packages = Array.from({ length: 20 }, (_, i) => `pkg-${i}`);
    await validatePackages(packages, { concurrency: 5 });
    expect(maxConcurrent).toBeLessThanOrEqual(5);
  });
});
