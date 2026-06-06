#!/bin/sh
set -e

echo "Running prisma db push..."
cd /app/packages/database
npx prisma db push --accept-data-loss

echo "Starting API server..."
cd /app
exec node services/api/dist/index.js
