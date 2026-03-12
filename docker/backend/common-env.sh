#!/bin/sh
set -eu

read_required_secret() {
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

read_optional_secret() {
  secret_path="$1"

  if [ ! -f "$secret_path" ]; then
    return 0
  fi

  tr -d '\r\n' < "$secret_path"
}

url_encode() {
  bun -e 'process.stdout.write(encodeURIComponent(process.argv[1] ?? ""))' "$1"
}

build_postgres_url() {
  db_user="$1"
  db_password="$2"
  db_host="$3"
  db_name="$4"

  encoded_user=$(url_encode "$db_user")
  encoded_password=$(url_encode "$db_password")

  printf 'postgres://%s:%s@%s:5432/%s' "$encoded_user" "$encoded_password" "$db_host" "$db_name"
}

load_admin_database_env() {
  admin_password=$(read_required_secret /run/secrets/postgres_admin_password postgres_admin_password)
  admin_user=${POSTGRES_ADMIN_USER:?POSTGRES_ADMIN_USER is required}
  database_name=${POSTGRES_DB:?POSTGRES_DB is required}

  export POSTGRES_ADMIN_PASSWORD="$admin_password"
  export ADMIN_DATABASE_URL="$(build_postgres_url "$admin_user" "$admin_password" db "$database_name")"
  export BOOTSTRAP_DATABASE_URL="${BOOTSTRAP_DATABASE_URL:-$ADMIN_DATABASE_URL}"
}

load_runtime_database_env() {
  app_password=$(read_required_secret /run/secrets/postgres_app_password postgres_app_password)
  app_user=${POSTGRES_APP_USER:?POSTGRES_APP_USER is required}
  database_name=${POSTGRES_DB:?POSTGRES_DB is required}

  export APP_DB_USER="$app_user"
  export APP_DB_PASSWORD="$app_password"
  export APP_DATABASE_URL="$(build_postgres_url "$app_user" "$app_password" db "$database_name")"
  export DATABASE_URL="$APP_DATABASE_URL"
}

load_storage_env() {
  app_secret=$(read_required_secret /run/secrets/minio_app_secret_key minio_app_secret_key)

  export S3_ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
  export S3_REGION="${S3_REGION:-eu-west-1}"
  export S3_BUCKET="${S3_BUCKET:?S3_BUCKET is required}"
  export S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}"
  export S3_ACCESS_KEY_ID="${MINIO_APP_USER:?MINIO_APP_USER is required}"
  export S3_SECRET_ACCESS_KEY="$app_secret"
}

load_optional_api_keys() {
  marketstack_key=$(read_optional_secret /run/secrets/marketstack_api_key || true)
  if [ -n "${marketstack_key:-}" ]; then
    export MARKETSTACK_API_KEY="$marketstack_key"
  fi

  hugging_face_token=$(read_optional_secret /run/secrets/hugging_face_hub_token || true)
  if [ -n "${hugging_face_token:-}" ]; then
    export HUGGING_FACE_HUB_TOKEN="$hugging_face_token"
  fi
}
