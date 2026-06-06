# Flowtiq Infrastructure

## Services

| Service | Platform | URL |
|---|---|---|
| API (Express.js) | Railway | https://flowtiq-api-production.up.railway.app |
| Admin Portal (Next.js) | Vercel | https://flowtiq-admin.vercel.app |
| Database (PostgreSQL) | Railway | Internal: postgres.railway.internal |
| File Storage | Cloudinary | Cloud: dii6olxpd |
| Repository | GitHub | https://github.com/ajitzagade/flowtiq |

---

## Railway — API

**Builder:** Dockerfile (repo root) · **Base:** node:20-slim
**Startup:** `/app/start.sh` → prisma db push → node services/api/dist/index.js

### Environment Variables
```
DATABASE_URL=postgresql://...railway.internal.../railway
JWT_SECRET=
JWT_REFRESH_SECRET=
CORS_ORIGIN=https://flowtiq-admin.vercel.app
CLOUDINARY_CLOUD_NAME=dii6olxpd
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SEED_SECRET=flowtiq-seed-2024
NODE_ENV=production
PORT=3001
```

### Key Config Files
```
Dockerfile          — build steps (node:20-slim, openssl, pnpm, prisma generate, tsc)
railway.toml        — startCommand: /app/start.sh
start.sh            — prisma db push --accept-data-loss && node services/api/dist/index.js
packages/database/prisma/schema.prisma
  └── binaryTargets = ["native", "debian-openssl-3.0.x"]
```

### Seed Database
```bash
curl -X POST https://flowtiq-api-production.up.railway.app/api/seed \
  -H "x-seed-secret: flowtiq-seed-2024"
```

---

## Vercel — Admin Portal

**Framework:** Next.js 14 (App Router)
**Config:** `apps/admin-portal/vercel.json`
**Build:** `pnpm --filter @flowtiq/admin-portal build`

### Environment Variables
```
NEXT_PUBLIC_API_URL=https://flowtiq-api-production.up.railway.app
NEXT_PUBLIC_APP_NAME=Flowtiq
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### Manual Deploy
```bash
# from repo root
npx vercel --prod
```

---

## Cloudinary — File Storage

- Cloud name: `dii6olxpd`
- Documents uploaded via multer memoryStorage + Cloudinary upload_stream
- Storage helper: `services/api/src/lib/storage.ts`
- Files stored at Cloudinary URLs (returned as `filePath` on Document records)

---

## Database

- Provider: PostgreSQL (Railway managed)
- ORM: Prisma with 17 models
- Schema: `packages/database/prisma/schema.prisma`
- Push schema changes: `cd packages/database && npx prisma db push`

---

## Seed Data — Vastudeep Associates

| Email | Role | Password |
|---|---|---|
| superadmin@flowtiq.com | Super Admin | Admin@123 |
| admin@vastudeep.com | Admin | Admin@123 |
| pm@vastudeep.com | Project Manager | Admin@123 |
| exec1@vastudeep.com | File Executive | Admin@123 |
| followup@vastudeep.com | Follow-up Executive | Admin@123 |

8 projects · 1 workflow (6 stages) · 3 follow-ups · 2 notifications

---

## Deployment Flow

```
git push origin main
    ├── Railway detects push → builds Dockerfile → deploys API
    └── Vercel detects push → builds Next.js → deploys frontend
```

Both services auto-deploy on every push to `main`.
