#!/usr/bin/env bash
set -euo pipefail

readonly SERVICE="postgres"
readonly COMPOSE_FILE="compose.uat.yml"
project="${NEXAFLOW_COMPOSE_PROJECT:-nexaflow-uat}"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]{2,62}$ ]] || { echo "NEXAFLOW_COMPOSE_PROJECT is invalid" >&2; exit 64; }
readonly PROJECT="$project"

if [[ $# -ne 3 ]]; then
  echo "usage: restore.sh ABSOLUTE_ENCRYPTED_BACKUP ABSOLUTE_KEY_FILE DISPOSABLE_DATABASE_NAME" >&2
  exit 64
fi

backup_file="$1"
key_file="$2"
restore_database="$3"

[[ "$backup_file" = /* && -f "$backup_file" && -r "$backup_file" ]] || { echo "backup must be an explicit readable absolute file" >&2; exit 64; }
[[ "$key_file" = /* && -f "$key_file" && -r "$key_file" ]] || { echo "key must be an explicit readable absolute file" >&2; exit 64; }
[[ "$restore_database" =~ ^[a-z][a-z0-9_]{2,62}$ ]] || { echo "disposable database name is invalid" >&2; exit 64; }
command -v docker >/dev/null
command -v openssl >/dev/null

source_database="$(docker compose --project-name "$PROJECT" --file "$COMPOSE_FILE" exec -T "$SERVICE" sh -ceu 'printf %s "$POSTGRES_DB"')"
[[ "$restore_database" != "$source_database" ]] || { echo "refusing to restore over the configured UAT database" >&2; exit 65; }

exists="$(docker compose --project-name "$PROJECT" --file "$COMPOSE_FILE" exec -T "$SERVICE" sh -ceu 'psql -XAt -U "$POSTGRES_USER" -d postgres -c "select datname from pg_database"' | grep -F -x -- "$restore_database" || true)"
[[ -z "$exists" ]] || { echo "refusing to restore into an existing database" >&2; exit 73; }

docker compose --project-name "$PROJECT" --file "$COMPOSE_FILE" exec -T "$SERVICE" sh -ceu 'createdb -U "$POSTGRES_USER" "$1"' sh "$restore_database"
if ! openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:${key_file}" -in "$backup_file" \
  | gunzip \
  | docker compose --project-name "$PROJECT" --file "$COMPOSE_FILE" exec -T "$SERVICE" sh -ceu 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"' sh "$restore_database"; then
  echo "restore failed; the explicitly named disposable database was retained for investigation" >&2
  exit 1
fi

docker compose --project-name "$PROJECT" --file "$COMPOSE_FILE" exec -T "$SERVICE" sh -ceu 'psql -XAt -U "$POSTGRES_USER" -d "$1" -c "select count(*) from drizzle.__drizzle_migrations"' sh "$restore_database"
echo "restore verified in disposable database: $restore_database"
