#!/usr/bin/env bun
/**
 * Downloads the release manifest for the specified GitHub tag (or the latest tag)
 * into the given stack directory. The script is intentionally dependency-free so
 * it can run anywhere Bun or Node is available.
 */

/// <reference lib="dom" />

import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

type Release = {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
};

type Options = {
  stackDir: string;
  composeFile: string;
  owner: string;
  repo: string;
  assetName: string;
  githubToken?: string;
  targetTag?: string;
};

const DEFAULTS = {
  stackDir: process.env.STACK_DIR ?? process.cwd(),
  composeFile: process.env.STACK_COMPOSE_FILE ?? 'docker-compose.release.yml',
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  assetName: 'docker-compose.release.yml',
};

function parseArgs(argv: string[]): Options {
  const args = [...argv];
  const opts: Record<string, string | undefined> = {};

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) continue;
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = args.shift();
    if (!value) {
      throw new Error(`Missing value for ${arg}`);
    }
    opts[key] = value;
  }

  const stackDir = path.resolve(opts['stack-dir'] ?? DEFAULTS.stackDir);
  const composeFile = opts['compose-file'] ?? DEFAULTS.composeFile;
  const owner = opts.owner ?? DEFAULTS.owner;
  const repo = opts.repo ?? DEFAULTS.repo;
  const assetName = opts['asset-name'] ?? DEFAULTS.assetName;
  const targetTag = opts['target-tag'];
  const githubToken = opts['github-token'] ?? process.env.GITHUB_TOKEN;

  if (!owner || !repo) {
    throw new Error('Both --owner and --repo (or GITHUB_OWNER/GITHUB_REPO) are required');
  }

  return {
    stackDir,
    composeFile,
    owner,
    repo,
    assetName,
    targetTag,
    githubToken,
  };
}

async function fetchJson<T>(url: string, githubToken?: string): Promise<T> {
  const res = await fetch(url, {
    headers: githubToken
      ? {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
        }
      : { Accept: 'application/vnd.github+json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function downloadFile(url: string, dest: string, githubToken?: string) {
  const res = await fetch(url, {
    headers: githubToken
      ? {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/octet-stream',
        }
      : { Accept: 'application/octet-stream' },
  });

  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tempPath = `${dest}.tmp`;
  await pipeline(res.body, createWriteStream(tempPath));
  await fs.rename(tempPath, dest);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = `https://api.github.com/repos/${opts.owner}/${opts.repo}/releases`;
  const releaseUrl = opts.targetTag ? `${baseUrl}/tags/${opts.targetTag}` : `${baseUrl}/latest`;
  const release = await fetchJson<Release>(releaseUrl, opts.githubToken);
  const asset = release.assets.find((a) => a.name === opts.assetName);

  if (!asset) {
    throw new Error(
      `Asset "${opts.assetName}" not found in release ${release.tag_name}. Available assets: ${release.assets
        .map((a) => a.name)
        .join(', ')}`,
    );
  }

  const composePath = path.join(opts.stackDir, opts.composeFile);
  await downloadFile(asset.browser_download_url, composePath, opts.githubToken);
  process.stdout.write(
    `Downloaded ${opts.assetName} for ${release.tag_name} into ${composePath}\n`,
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
