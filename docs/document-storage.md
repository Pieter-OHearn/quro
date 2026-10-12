# Document storage

Quro keeps uploaded PDFs (payslips, pension statements and statement imports) outside the database. Each row stores the document's key, file name and size; the file itself lives in the document store. `QRO_DOCUMENT_STORAGE` chooses the store:

| `QRO_DOCUMENT_STORAGE` | Where documents are                                                                                                    | Use it when                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `filesystem` (default) | Files under `QRO_DOCUMENTS_DIR`, default `/var/lib/quro/documents`. The Compose stack mounts `./data/documents` there. | One host runs Quro. Nothing else to install.                          |
| `s3`                   | A bucket in an S3-compatible store that you run                                                                        | You already run object storage, or the services run on several hosts. |

The keys are the same in both stores, for example `users/<user id>/salary/payslips/<payslip id>/<random id>.pdf`, so documents can move from one store to the other without changing a row.

## Filesystem storage

- The directory must exist and be writable by the user the backend runs as. Quro never creates it: a missing directory usually means a missing volume, and files written into the container would be lost when it is recreated. `GET /api/readiness` reports `documentStorage` as not ready until the directory is usable, and uploads fail.
- Each document is a file at its key under the directory. Directories are created with mode `0700` and files with `0600`, readable by the backend user only. A file is written under a temporary name, flushed and renamed, so a reader never sees half a document.
- `QRO_DOCUMENTS_DIR` must be an absolute path.
- The pension import worker, when you run it, mounts the same directory and runs as the same user as the backend.
- `quro backup` puts the documents into the same archive as the database dump, with every file's SHA-256, while changes are paused; `quro restore` puts them back. Names starting with a dot (temporary files) are left out. See [backup and restore](backup-and-restore.md).

## S3-compatible storage

Any service that speaks the S3 API works. Quro does not install, pin or administer one, and it does not create the bucket or the access key: create both with your store's own tools first. The access key needs to get, put, delete and list objects in the bucket.

| Setting                     | Value                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `QRO_DOCUMENT_STORAGE`      | `s3`                                                                                          |
| `S3_ENDPOINT`               | The store's URL, for example `https://s3.example.com`                                         |
| `S3_REGION`                 | The region name the store expects                                                             |
| `S3_BUCKET`                 | The bucket                                                                                    |
| `S3_ACCESS_KEY_ID`          | The access key id                                                                             |
| `S3_SECRET_ACCESS_KEY_FILE` | File holding the secret access key. Default `/run/secrets/s3_secret_access_key`               |
| `S3_FORCE_PATH_STYLE`       | `true` (default) for most self-hosted stores, `false` for stores that need virtual-host style |

Quro asks the store to encrypt every object at rest (`x-amz-server-side-encryption: AES256`). The store has to support that request; MinIO, for example, needs a KMS key for it.

With the Compose stack, put the settings in `.env` and mount the secret with an override file next to `docker-compose.yml`, for example `compose.s3.yaml`:

```yaml
services:
  backend:
    secrets: [s3_secret_access_key]
  pension-import-worker:
    secrets: [s3_secret_access_key]

secrets:
  s3_secret_access_key:
    file: ./secrets/s3_secret_access_key.txt
```

Write the secret access key into `secrets/s3_secret_access_key.txt`, then start the stack with both files:

```bash
docker compose -f docker-compose.yml -f compose.s3.yaml up -d
```

S3 settings (`S3_ENDPOINT`, `S3_BUCKET` or `S3_ACCESS_KEY_ID`) without `QRO_DOCUMENT_STORAGE` stop every command with exit code 2. Quro does not guess: falling back to an empty documents directory would hide the documents that are in the store. Set `QRO_DOCUMENT_STORAGE=s3` to keep using the store, or move the documents to the filesystem first.

## Move documents from S3 to the filesystem

`quro documents migrate-from-s3` copies every document the database refers to from the S3 store into the documents directory, under the same key:

- It reads the objects through the S3 API, so it works with a store that encrypts at rest. Do not copy a store's data directory instead: with encryption at rest those files cannot be read.
- It checks every copy: the bytes it wrote are read back and compared by SHA-256 with what the store returned, and with the size (and, for statement imports, the SHA-256) recorded when the document was uploaded.
- It changes no database row and never writes to or deletes from the S3 store.
- It adds nothing to the documents directory unless every needed document was copied. Verified copies wait in `.migrate-from-s3` inside the documents directory until then, and a later run checks them again and downloads only what is missing. After a successful run that directory is gone.
- A file that is already in the documents directory is never overwritten. One with the same content as in the store is reported as already present.
- Run one copy at a time. Two runs at once do not damage anything, but one of them can stop with an error; run it again afterwards.

Steps for the Compose stack:

1. Keep `QRO_DOCUMENT_STORAGE=s3` and the S3 settings, and keep the store running. Installs from a 0.7.0 checkout ran MinIO from the Compose file, which no longer has it; keep running your store until the copy has finished.
2. Make sure the documents directory exists (`mkdir -p ./data/documents`) and that the backend has it mounted, as the Compose file in this repository does.
3. Stop the services that write documents, so that nothing is uploaded during the copy:

   ```bash
   docker compose stop backend pension-import-worker
   ```

4. Copy:

   ```bash
   docker compose -f docker-compose.yml -f compose.s3.yaml run --rm --no-deps backend \
     documents migrate-from-s3
   ```

   It prints one line per document and a summary. If it stops with failures, fix them (see below) and run it again.

5. Set `QRO_DOCUMENT_STORAGE=filesystem` in `.env` and start the stack without the S3 override:

   ```bash
   docker compose up -d
   ```

6. Open a few documents in Quro to check that they download. Keep the store and its data until you no longer need them; removing them is your decision.

The command prints keys and row references such as `payslips#12`, never file names or amounts. Its exit codes:

| Code | Meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| 0    | Every needed document is in the documents directory                              |
| 1    | Some documents could not be copied; nothing was added to the documents directory |
| 2    | Settings are invalid or the S3 settings are missing                              |
| 4    | The S3 store or the database cannot be reached; nothing was copied               |

What a failure means:

| Reason in the output                                                          | What it means                                             | What to do                                                                                                                         |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `missing from S3`                                                             | A row refers to a document the store does not have        | Put the object back from a backup of the store, or remove the attachment in Quro (the document is already unavailable), then rerun |
| `checksum mismatch: S3 returned … bytes` or `… differs from the one recorded` | The object in the store is not the file that was uploaded | Restore it from a backup of the store. Do not switch until the run succeeds                                                        |
| `checksum mismatch: a different file is already in the documents directory`   | A file with that key exists and has other content         | Check that file and move it away; the command never overwrites it                                                                  |
| `could not be read from S3 (…)`                                               | A network or permission error for that object             | Fix the access and rerun; copies made so far are kept                                                                              |
| `the key is not a safe relative path`                                         | The row holds a key Quro does not create                  | Report it; the document cannot be stored as a file                                                                                 |

Documents of cancelled, failed or expired statement imports are not read by Quro any more. When the store no longer has them, they are reported as skipped and do not stop the run. Objects in the bucket that no row refers to are not copied.
