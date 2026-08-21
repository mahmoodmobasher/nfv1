#!/usr/bin/env bash
set -euo pipefail

readonly SERVICE="postgres"
readonly COMPOSE_FILE="compose.uat.yml"
project="${NEXAFLOW_COMPOSE_PROJECT:-nexaflow-uat}"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]{2,62}$ ]] || { echo "NEXAFLOW_COMPOSE_PROJECT is invalid" >&2; exit 64; }
readonly PROJECT="$project"

if [[ $# -ne 2 ]]; then
  echo "usage: backup.sh ABSOLUTE_BACKUP_DIRECTORY RELEASE_ID" >&2
  exit 64
fi

backup_directory="$1"
release_id="$2"
key_file="${BACKUP_ENCRYPTION_KEY_FILE:-}"

[[ "$backup_directory" = /* && "$backup_directory" != "/" && -d "$backup_directory" ]] || { echo "backup directory must be an existing explicit absolute directory" >&2; exit 64; }
[[ "$release_id" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "release id contains unsupported characters" >&2; exit 64; }
[[ -n "$key_file" && "$key_file" = /* && -r "$key_file" ]] || { echo "BACKUP_ENCRYPTION_KEY_FILE must name a readable absolute key file" >&2; exit 64; }
command -v docker >/dev/null
command -v openssl >/dev/null
command -v sha256sum >/dev/null || command -v shasum >/dev/null

backup_directory="$(cd "$backup_directory" && pwd -P)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
basename="nexaflow-uat_${release_id}_${timestamp}.sql.gz.enc"
target="${backup_directory}/${basename}"
temporary="${target}.partial"
manifest="${target}.manifest"

[[ ! -e "$target" && ! -e "$temporary" && ! -e "$manifest" ]] || { echo "backup target already exists" >&2; exit 73; }
trap 'rm -f -- "$temporary"' EXIT

database_name="$(docker compose --project-name "$PROJECT" --file "$COMPOSE_FILE" exec -T "$SERVICE" sh -ceu 'printf %s "$POSTGRES_DB"')"
migration_head="$(docker compose --project-name "$PROJECT" --file "$COMPOSE_FILE" exec -T "$SERVICE" sh -ceu 'psql -XAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select coalesce(max(created_at)::text, '\''none'\'') from drizzle.__drizzle_migrations"')"

docker compose --project-name "$PROJECT" --file "$COMPOSE_FILE" exec -T "$SERVICE" sh -ceu 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain --no-owner --no-privileges' \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:${key_file}" -out "$temporary"

chmod 600 "$temporary"
mv -- "$temporary" "$target"
if command -v sha256sum >/dev/null; then checksum="$(sha256sum "$target" | awk '{print $1}')"; else checksum="$(shasum -a 256 "$target" | awk '{print $1}')"; fi
umask 077
{
  printf 'backup_file=%s\n' "$basename"
  printf 'database=%s\n' "$database_name"
  printf 'release_id=%s\n' "$release_id"
  printf 'migration_head=%s\n' "$migration_head"
  printf 'created_at=%s\n' "$timestamp"
  printf 'sha256=%s\n' "$checksum"
  printf 'encryption=openssl-aes-256-cbc-pbkdf2\n'
  printf 'restore=deploy/uat/restore.sh %s ABSOLUTE_KEY_FILE DISPOSABLE_DATABASE_NAME\n' "$target"
} > "$manifest"
trap - EXIT
echo "encrypted backup and manifest created: $target"
