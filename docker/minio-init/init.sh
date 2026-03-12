#!/bin/sh
set -eu

read_secret() {
  secret_path="$1"
  secret_name="$2"

  if [ ! -f "$secret_path" ]; then
    echo >&2 "Missing required secret: $secret_name ($secret_path)"
    exit 1
  fi

  secret_value=$(tr -d '\r\n' < "$secret_path")
  if [ -z "$secret_value" ]; then
    echo >&2 "Secret is empty: $secret_name ($secret_path)"
    exit 1
  fi

  printf '%s' "$secret_value"
}

MINIO_ROOT_USER=${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}
MINIO_ROOT_PASSWORD=$(read_secret /run/secrets/minio_root_password minio_root_password)
MINIO_APP_USER=${MINIO_APP_USER:?MINIO_APP_USER is required}
MINIO_APP_PASSWORD=$(read_secret /run/secrets/minio_app_secret_key minio_app_secret_key)
S3_BUCKET=${S3_BUCKET:?S3_BUCKET is required}
POLICY_NAME=quro-app-bucket-policy
POLICY_PATH=/tmp/quro-app-policy.json

attempt=0
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo >&2 "Timed out waiting for MinIO admin API."
    exit 1
  fi

  sleep 2
done

mc mb --ignore-existing "local/$S3_BUCKET"
mc anonymous set none "local/$S3_BUCKET" >/dev/null 2>&1 || true

cat > "$POLICY_PATH" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::$S3_BUCKET"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:AbortMultipartUpload",
        "s3:DeleteObject",
        "s3:GetObject",
        "s3:ListMultipartUploadParts",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::$S3_BUCKET/*"
      ]
    }
  ]
}
EOF

if mc admin user info local "$MINIO_APP_USER" >/dev/null 2>&1; then
  mc admin user remove local "$MINIO_APP_USER"
fi
mc admin user add local "$MINIO_APP_USER" "$MINIO_APP_PASSWORD"

if mc admin policy info local "$POLICY_NAME" >/dev/null 2>&1; then
  mc admin policy remove local "$POLICY_NAME"
fi
mc admin policy create local "$POLICY_NAME" "$POLICY_PATH"
mc admin policy attach local "$POLICY_NAME" --user "$MINIO_APP_USER"

echo "MinIO bucket and app user are ready."
