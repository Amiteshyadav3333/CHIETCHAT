#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm install

echo "==> Generating Prisma Client..."
npx prisma generate

echo "==> Resolving any already-applied migrations..."
# These migrations already exist in DB — mark them as applied in Prisma tracking table
# '|| true' ensures build doesn't fail if already resolved
npx prisma migrate resolve --applied "20260411000000_init_postgresql" 2>/dev/null || true
npx prisma migrate resolve --applied "20260411001000_add_livekit_egress_id" 2>/dev/null || true

echo "==> Deploying any new migrations..."
npx prisma migrate deploy

echo "==> Build complete!"
