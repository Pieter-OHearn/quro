import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Containers are the distribution boundary: workspace packages are never published to a
// registry, and the release version lives only in VERSION (see docs/development.md).
const ROOT = join(import.meta.dir, '..');

type Manifest = { name?: string; private?: unknown; version?: unknown; workspaces?: unknown };

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

function workspaceManifests(): { path: string; manifest: Manifest }[] {
  const root = readManifest(join(ROOT, 'package.json'));
  expect(root.workspaces).toEqual(['packages/*']);
  return readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('packages', entry.name, 'package.json'))
    .map((path) => ({ path, manifest: readManifest(join(ROOT, path)) }));
}

describe('workspace manifests', () => {
  test('covers the backend, frontend and shared packages', () => {
    const names = workspaceManifests().map(({ manifest }) => manifest.name);
    expect(names.sort()).toEqual(['@quro/backend', '@quro/frontend', '@quro/shared']);
  });

  test('every package, including the root, is private so it cannot be published', () => {
    const manifests = [
      { path: 'package.json', manifest: readManifest(join(ROOT, 'package.json')) },
      ...workspaceManifests(),
    ];
    for (const { path, manifest } of manifests) {
      expect({ path, private: manifest.private }).toEqual({ path, private: true });
    }
  });

  test('no package carries its own version; VERSION is the only release version', () => {
    const manifests = [
      { path: 'package.json', manifest: readManifest(join(ROOT, 'package.json')) },
      ...workspaceManifests(),
    ];
    for (const { path, manifest } of manifests) {
      expect({ path, version: manifest.version }).toEqual({ path, version: undefined });
    }
  });
});
