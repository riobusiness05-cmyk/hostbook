#!/usr/bin/env bash
# Create a Postgres migration for a schema change, without needing a local
# Postgres: diff the committed schema against the working copy.
#
#   scripts/new-migration.sh add_guest_birthday
#
# Local development keeps using SQLite + `npm run db:push`; production applies
# these migrations in the build (scripts/db-deploy.mjs). The schema file must
# have provider = "postgresql" when you run this (flip it back after).
set -euo pipefail
name="${1:?usage: scripts/new-migration.sh <snake_case_name>}"
stamp="$(date -u +%Y%m%d%H%M%S)"
dir="prisma/migrations/${stamp}_${name}"
old="$(mktemp)"; git show HEAD:prisma/schema.prisma > "$old"
sed -i '' 's/provider = "sqlite"/provider = "postgresql"/' "$old" prisma/schema.prisma
mkdir -p "$dir"
npx prisma migrate diff --from-schema-datamodel "$old" --to-schema-datamodel prisma/schema.prisma --script > "$dir/migration.sql"
echo "wrote $dir/migration.sql"; cat "$dir/migration.sql"
