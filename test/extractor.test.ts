import { describe, it, expect } from 'vitest';
import { extractPackageNames } from '../src/extractor.js';

describe('extractPackageNames', () => {
  it('extracts single package from npm install', () => {
    expect(extractPackageNames('npm install express')).toEqual(['express']);
  });

  it('extracts multiple packages from npm install', () => {
    expect(extractPackageNames('npm install express lodash')).toEqual(['express', 'lodash']);
  });

  it('extracts scoped packages', () => {
    expect(extractPackageNames('npm install @types/node')).toEqual(['@types/node']);
  });

  it('strips version specifiers', () => {
    expect(extractPackageNames('npm install express@4.18.0')).toEqual(['express']);
  });

  it('strips version from scoped packages', () => {
    expect(extractPackageNames('npm install @types/node@20')).toEqual(['@types/node']);
  });

  it('skips flags with npm i', () => {
    expect(extractPackageNames('npm i -D typescript')).toEqual(['typescript']);
  });

  it('skips all flags', () => {
    expect(extractPackageNames('npm install --save-dev jest --save')).toEqual(['jest']);
  });

  it('npx: extracts only the first package argument', () => {
    expect(extractPackageNames('npx create-react-app my-project')).toEqual(['create-react-app']);
  });

  it('npx with -y flag', () => {
    expect(extractPackageNames('npx -y degit user/repo')).toEqual(['degit']);
  });

  it('npx --package flags', () => {
    expect(extractPackageNames('npx --package=typescript --package=ts-node ts-node script.ts')).toEqual(['typescript', 'ts-node', 'ts-node']);
  });

  it('pnpm add', () => {
    expect(extractPackageNames('pnpm add express')).toEqual(['express']);
  });

  it('pnpm dlx', () => {
    expect(extractPackageNames('pnpm dlx create-next-app')).toEqual(['create-next-app']);
  });

  it('yarn add multiple', () => {
    expect(extractPackageNames('yarn add react react-dom')).toEqual(['react', 'react-dom']);
  });

  it('bun add', () => {
    expect(extractPackageNames('bun add hono')).toEqual(['hono']);
  });

  it('bunx: only first package argument', () => {
    expect(extractPackageNames('bunx create-vite my-app')).toEqual(['create-vite']);
  });

  it('stops at &&', () => {
    expect(extractPackageNames('npm install express && npm start')).toEqual(['express']);
  });

  it('stops at pipe', () => {
    expect(extractPackageNames('npm install express | grep something')).toEqual(['express']);
  });

  it('returns empty for empty/malformed commands', () => {
    expect(extractPackageNames('')).toEqual([]);
    expect(extractPackageNames('npm')).toEqual([]);
    expect(extractPackageNames('npm install')).toEqual([]);
  });
});
