#!/usr/bin/env bun
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';

type QueueItem = {
  tag: string;
  deliveryId: string;
};

const port = Number(process.env.RELEASE_WEBHOOK_PORT ?? '9002');
const secret = process.env.RELEASE_WEBHOOK_SECRET;
const stackDir = process.env.STACK_DIR ?? '/stack';
const composeFile = process.env.STACK_COMPOSE_FILE ?? 'docker-compose.release.yml';
const applyScript =
  process.env.APPLY_RELEASE_SCRIPT ?? `${stackDir}/deploy/auto-update/apply-release.sh`;

if (!secret) {
  throw new Error('RELEASE_WEBHOOK_SECRET must be set');
}

if (!process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
  throw new Error('GITHUB_OWNER and GITHUB_REPO must be set');
}

const queue: QueueItem[] = [];
let running = false;
let currentTag: string | null = null;

function verifySignature(body: string, header?: string | null) {
  if (!header) return false;
  const [algo, signature] = header.split('=');
  if (algo !== 'sha256' || !signature) return false;
  const digest = createHmac('sha256', secret).update(body).digest('hex');
  return timingSafeEqual(signature, digest);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function enqueue(tag: string, deliveryId: string) {
  if (tag === currentTag || queue.some((item) => item.tag === tag)) {
    console.log(`Tag ${tag} already queued or running, skipping duplicate notification`);
    return;
  }
  queue.push({ tag, deliveryId });
  if (!running) {
    void processQueue();
  }
}

async function processQueue(): Promise<void> {
  const item = queue.shift();
  if (!item) {
    running = false;
    currentTag = null;
    return;
  }
  running = true;
  currentTag = item.tag;
  console.log(`Applying release ${item.tag} from delivery ${item.deliveryId}`);

  try {
    await runApplyScript(item.tag);
    console.log(`Release ${item.tag} applied successfully`);
  } catch (err) {
    console.error(`Release ${item.tag} failed`, err);
  } finally {
    currentTag = null;
    await processQueue();
  }
}

function runApplyScript(tag: string) {
  return new Promise<void>((resolve, reject) => {
    const env = {
      ...process.env,
      STACK_DIR: stackDir,
      STACK_COMPOSE_FILE: composeFile,
      TARGET_TAG: tag,
    };
    const args = [applyScript, '--target-tag', tag];
    const child = spawn('/bin/bash', args, {
      env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`apply-release exited with code ${code}`));
      }
    });
  });
}

async function parseJsonBody(req: Request) {
  const text = await req.text();
  return { text, json: JSON.parse(text) };
}

const server = Bun.serve({
  port,
  fetch: async (req) => {
    if (req.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    const signature = req.headers.get('x-hub-signature-256');
    const event = req.headers.get('x-github-event');
    const delivery = req.headers.get('x-github-delivery') ?? 'unknown';

    const { text, json } = await parseJsonBody(req);

    if (!verifySignature(text, signature)) {
      console.warn('Invalid signature for delivery', delivery);
      return new Response('Invalid signature', { status: 401 });
    }

    if (event === 'ping') {
      return Response.json({ ok: true });
    }

    if (event !== 'release' || json.action !== 'published') {
      return new Response('Ignored', { status: 202 });
    }

    const tag = json.release?.tag_name;
    if (!tag) {
      console.warn('Release payload missing tag_name', json);
      return new Response('Bad payload', { status: 400 });
    }

    enqueue(tag, delivery);
    return Response.json({ queued: true, tag });
  },
});

console.log(`Release webhook listening on port ${server.port}`);
