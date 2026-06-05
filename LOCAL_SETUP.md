# Flowtiq — Local Setup Guide

Complete instructions to run the Flowtiq multi-tenant workflow management platform locally.

---

## Prerequisites

Ensure the following are installed before proceeding:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 18.0.0 | https://nodejs.org or `nvm install 18` |
| pnpm | >= 8.0.0 | `npm install -g pnpm@8` |
| PostgreSQL | >= 14.0 | https://www.postgresql.org/download |
| Git | Any | https://git-scm.com |

Verify installations:
```bash
node --version
pnpm --version
psql --version
```

---

## Step 1 — Clone and Install Dependencies

```bash
# Navigate to the project root
cd /path/to/Flowtiq

# Install all workspace dependencies
pnpm install
```

This installs dependencies for all packages, services, and apps in the monorepo.

---

## Step 2 — Database Setup

### 2a. Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE flowtiq;

# Create dedicated user (recommended)
CREATE USER flowtiq_user WITH PASSWORD 'flowtiq_pass';
GRANT ALL PRIVILEGES ON DATABASE flowtiq TO flowtiq_user;

# Exit psql
\q
```

### 2b. Configure Environment

```bash
# Copy environment file for the API service
cp services/api/.env.example services/api/.env

# Copy environment file for admin portal
cp apps/admin-portal/.env.example apps/admin-portal/.env.local
```

Edit `services/api/.env`:
```env
NODE_ENV=development
PORT=3001

# Update with your PostgreSQL credentials
DATABASE_URL=postgresql://flowtiq_user:flowtiq_pass@localhost:5432/flowtiq

# Generate secure secrets (use a random string generator)
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this

# Frontend URL (for CORS)
CORS_ORIGIN=http://localhost:3000

# File storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
```

Edit `apps/admin-portal/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=Flowtiq
```

---

## Step 3 — Database Migrations and Seeding

```bash
# Navigate to the database package
cd packages/database

# Generate Prisma client
pnpm db:generate

# Apply database schema (creates all tables)
pnpm db:push

# Seed the database with demo data for Vastudeep Associates
pnpm db:seed

# Go back to project root
cd ../..
```

### What the seed creates:
- **1 Tenant**: Vastudeep Associates (professional plan)
- **5 Roles**: Tenant Admin, Project Manager, File Executive, Follow-up Executive, Viewer
- **24 Permissions**: Full RBAC matrix across all modules
- **6 Users**: Admin, PM, 2 File Executives, Follow-up Executive
- **1 Workflow**: Standard Building Plan Approval (6 stages)
- **8 Projects**: Realistic Mumbai/Pune construction projects with stages
- **10+ Follow-ups**: Mix of pending, overdue, and upcoming
- **4 Notifications**: Assignment and reminder notifications

---

## Step 4 — Start Development Servers

### Option A: Start Everything Together (Recommended)

```bash
# From project root — starts all services in parallel
pnpm dev
```

### Option B: Start Individually

```bash
# Terminal 1 — API Service (port 3001)
pnpm dev:api

# Terminal 2 — Admin Portal (port 3000)
pnpm dev:admin
```

### Option C: Direct Commands

```bash
# API service
cd services/api
pnpm dev

# Admin portal (new terminal)
cd apps/admin-portal
pnpm dev
```

---

## Step 5 — Access the Application

| Service | URL | Description |
|---------|-----|-------------|
| Admin Portal | http://localhost:3000 | Main web application |
| API Server | http://localhost:3001 | REST API |
| API Health | http://localhost:3001/health | Health check endpoint |
| Prisma Studio | Run `pnpm db:studio` in packages/database | Database GUI |

---

## Demo Login Credentials

All accounts use the password: **Admin@123**

| Role | Email | Access |
|------|-------|--------|
| Super Admin | superadmin@flowtiq.com | Full platform access, manage all tenants |
| Tenant Admin | admin@vastudeep.com | Full access to Vastudeep tenant |
| Project Manager | pm@vastudeep.com | Create/manage projects, view all |
| File Executive | exec1@vastudeep.com | Process files, upload documents |
| Follow-up Executive | followup@vastudeep.com | Manage follow-ups, view projects |

---

## Project Structure Overview

```
Flowtiq/
├── apps/
│   └── admin-portal/          # Next.js 14 (App Router) — Port 3000
├── packages/
│   ├── shared-types/          # TypeScript interfaces (all shared types)
│   ├── database/              # Prisma schema, migrations, seed
│   ├── permissions/           # RBAC definitions and helpers
│   ├── auth/                  # JWT utilities
│   └── api-client/            # Type-safe API client
├── services/
│   └── api/                   # Express.js REST API — Port 3001
├── configs/
│   ├── eslint/                # Shared ESLint config
│   └── typescript/            # Shared TypeScript configs
├── LOCAL_SETUP.md             # This file
├── package.json               # Monorepo root
├── pnpm-workspace.yaml        # pnpm workspace definition
└── turbo.json                 # Turborepo build pipeline
```

---

## API Reference

### Authentication
```
POST   /api/auth/login          Login and get tokens
POST   /api/auth/refresh        Refresh access token
POST   /api/auth/logout         Logout
GET    /api/auth/me             Get current user
PUT    /api/auth/change-password Change password
```

### Projects
```
GET    /api/projects            List projects (paginated)
POST   /api/projects            Create project
GET    /api/projects/:id        Get project details
PATCH  /api/projects/:id        Update project
DELETE /api/projects/:id        Cancel project
```

### Stages
```
GET    /api/stages/project/:id  Get project stages
GET    /api/stages/:id          Get stage details
PATCH  /api/stages/:id          Update stage status/notes
```

### Follow-ups
```
GET    /api/follow-ups          List follow-ups (paginated)
POST   /api/follow-ups          Create follow-up
GET    /api/follow-ups/:id      Get follow-up
PATCH  /api/follow-ups/:id      Update follow-up
DELETE /api/follow-ups/:id      Cancel follow-up
```

### Documents
```
GET    /api/documents           List documents
POST   /api/documents/upload    Upload document (multipart/form-data)
GET    /api/documents/:id/download  Download document
POST   /api/documents/:id/replace   Replace with new version
DELETE /api/documents/:id       Delete document
GET    /api/documents/:id/versions  Get version history
```

### Users & Roles
```
GET    /api/users               List users
POST   /api/users               Create user
PATCH  /api/users/:id           Update user
DELETE /api/users/:id           Deactivate user
GET    /api/roles               List roles
POST   /api/roles               Create role
GET    /api/roles/permissions/all  All available permissions
```

### Workflows
```
GET    /api/workflows           List workflow templates
POST   /api/workflows           Create workflow
PATCH  /api/workflows/:id       Update workflow
DELETE /api/workflows/:id       Delete workflow
```

### Dashboard & Analytics
```
GET    /api/dashboard/stats     Dashboard statistics
GET    /api/audit               Audit logs (paginated)
GET    /api/audit/project/:id   Project activity
GET    /api/notifications       User notifications
PATCH  /api/notifications/:id/read    Mark notification read
PATCH  /api/notifications/read-all    Mark all read
```

### Super Admin Only
```
GET    /api/tenants             List all tenants
POST   /api/tenants             Create tenant
GET    /api/tenants/:id         Get tenant details
PATCH  /api/tenants/:id         Update tenant
DELETE /api/tenants/:id         Deactivate tenant
```

---

## Multi-Tenant Architecture

### How Tenant Isolation Works
1. Every database table has a `tenantId` column
2. Users log in → JWT payload includes `tenantId`
3. Every API request reads `tenantId` from JWT
4. All database queries automatically filter by `tenantId`
5. Super admin has `tenantId = null` and `isSuperAdmin = true`

### Adding a New Tenant
```bash
# 1. Login as super admin
POST /api/auth/login
{"email": "superadmin@flowtiq.com", "password": "Admin@123"}

# 2. Create tenant
POST /api/tenants
{
  "name": "New Client Name",
  "slug": "client-slug",
  "subscriptionPlan": "professional",
  "branding": {
    "primaryColor": "#1e3a5f",
    "secondaryColor": "#c9a84c",
    "theme": "light"
  }
}

# 3. Create admin user for the tenant
POST /api/users  (authenticated as tenant admin)
```

---

## White-Label / Branding

Each tenant can have custom branding without code changes:

```json
{
  "primaryColor": "#1e3a5f",
  "secondaryColor": "#c9a84c",
  "accentColor": "#e8f0fe",
  "fontFamily": "Inter",
  "theme": "light",
  "logo": "/uploads/tenant-slug/logo.png"
}
```

The admin portal reads the tenant's branding from the API and applies it via CSS custom properties at runtime. No deployment required.

---

## RBAC (Role-Based Access Control)

### Permission Codes
```
projects:create      projects:read       projects:update
projects:delete      projects:view_all
stages:update        stages:approve
documents:upload     documents:download  documents:delete
followups:create     followups:update    followups:view_all
users:create         users:read          users:update
users:delete         users:manage
roles:manage
workflows:manage
audit:read
settings:manage
reports:read         reports:export
```

### Adding Custom Roles
1. Go to **Roles** page in admin portal
2. Click **New Role**
3. Enter name, description, color
4. Select permissions from the matrix
5. Assign to users

---

## Useful Database Commands

```bash
cd packages/database

# View and edit data in browser
pnpm db:studio

# Reset database (WARNING: deletes all data)
pnpm db:reset

# Create a new migration
pnpm db:migrate

# Deploy migrations (production)
pnpm db:migrate:prod

# Re-run seed
pnpm db:seed
```

---

## File Storage

Uploaded files are stored locally at `services/api/uploads/`.

Structure:
```
uploads/
  {tenantId}/
    {projectId}/
      {stageId}/
        document_abc123.pdf
```

For production, replace local storage with S3:
1. Install `@aws-sdk/client-s3`
2. Update `services/api/src/lib/storage.ts`
3. Set environment variables: `AWS_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

---

## Production Deployment

### Environment Variables (Production)
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/flowtiq
JWT_SECRET=<minimum 32 character random string>
JWT_REFRESH_SECRET=<minimum 32 character random string>
CORS_ORIGIN=https://your-domain.com
UPLOAD_DIR=/var/flowtiq/uploads
```

### Build Commands
```bash
# Build everything
pnpm build

# Build specific package
pnpm build:admin
```

### Recommended Production Setup
- **API**: Deploy to Railway, Render, or AWS ECS
- **Frontend**: Deploy to Vercel (Next.js optimized)
- **Database**: Supabase PostgreSQL or AWS RDS
- **File Storage**: AWS S3 or Cloudflare R2
- **Process Manager**: PM2 for API service

---

## Troubleshooting

### pnpm install fails
```bash
# Clear cache and reinstall
rm -rf node_modules
pnpm store prune
pnpm install
```

### Database connection error
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Start PostgreSQL (macOS)
brew services start postgresql@14

# Verify DATABASE_URL in services/api/.env
```

### Prisma generate error
```bash
cd packages/database
npx prisma generate
```

### Port already in use
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### seed.ts: Cannot find module 'bcryptjs'
```bash
cd packages/database
pnpm add bcryptjs
pnpm add -D @types/bcryptjs
```

### Turbo cache issues
```bash
pnpm clean
pnpm install
pnpm dev
```

---

## Development Tips

- **Hot Reload**: Both the API (tsx watch) and Next.js support hot reload
- **Database Studio**: Run `pnpm db:studio` from `packages/database` for a GUI
- **API Testing**: Use [Bruno](https://www.usebruno.com) or Postman, import from `/api/health`
- **Type Safety**: All packages share types from `@flowtiq/shared-types`
- **Logs**: API logs requests in development mode via Morgan

---

## Architecture Decision Records

| Decision | Choice | Reason |
|----------|--------|--------|
| Package Manager | pnpm | Efficient, workspace support |
| Build System | Turborepo | Fast parallel builds, caching |
| ORM | Prisma | Type-safe, excellent DX |
| API Framework | Express | Mature, well-supported |
| Frontend | Next.js 14 | App Router, server components |
| Styling | Tailwind CSS | Utility-first, fast iteration |
| State | Zustand | Simple, no boilerplate |
| Data Fetching | React Query | Cache, background refetch |
| Auth | JWT | Stateless, scalable |
| Database | PostgreSQL | ACID, JSON support |

---

For support or questions, open an issue or contact the development team.
