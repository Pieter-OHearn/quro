import { getConfig, type DocumentsConfig } from '../config';
import type { DocumentStore } from './documentStore';
import { createFilesystemDocumentStore } from './filesystemDocumentStore';
import { createS3DocumentStore } from './s3';

// The document store the configuration selects (QRO_DOCUMENT_STORAGE). Routes, the import worker
// and readiness reach documents only through `getDocumentStore()`, so they work the same with
// either driver.

export function createDocumentStore(config: DocumentsConfig): DocumentStore {
  return config.driver === 'filesystem'
    ? createFilesystemDocumentStore(config.directory)
    : createS3DocumentStore(config.s3);
}

let cached: { config: DocumentsConfig; store: DocumentStore } | undefined;

/** The configured store, built once per parsed configuration. */
export function getDocumentStore(): DocumentStore {
  const config = getConfig().documents;
  if (cached?.config !== config) cached = { config, store: createDocumentStore(config) };
  return cached.store;
}
