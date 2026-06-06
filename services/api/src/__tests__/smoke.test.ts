/**
 * API Smoke Tests — Layer 1 + Layer 2
 *
 * Runs with mocked Prisma (no database required).
 * Covers:
 *   - Health endpoint
 *   - Auth middleware (401 without/with bad token)
 *   - Permission checks (403 vs 200)
 *   - Workflow stage format normalization (key/name always defined)
 *   - Super admin bypass of permission checks
 */

import request from 'supertest';
import { app } from '../app';
import { signAccessToken } from '../lib/jwt';

// ── Prisma mock ───────────────────────────────────────────────────────────────
// Must be before any imports that pull in routes that import prisma.
jest.mock('../lib/prisma', () => {
  const mockPrisma = {
    project: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
    },
    followUp: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    workflowTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    projectStage: {
      findMany: jest.fn(),
    },
    stageHistory: {
      findMany: jest.fn(),
    },
  };
  return {
    __esModule: true,
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

// ── Helper: get the mock prisma instance ─────────────────────────────────────
function getMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return jest.requireMock('../lib/prisma').default as {
    project: {
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      findFirst: jest.Mock;
    };
    followUp: { groupBy: jest.Mock; findMany: jest.Mock };
    workflowTemplate: { findMany: jest.Mock; findFirst: jest.Mock };
    auditLog: { findMany: jest.Mock; count: jest.Mock };
    projectStage: { findMany: jest.Mock };
    stageHistory: { findMany: jest.Mock };
  };
}

// ── Helper: create a valid JWT ────────────────────────────────────────────────
function token(overrides: {
  isSuperAdmin?: boolean;
  permissions?: string[];
} = {}) {
  return signAccessToken({
    userId: 'test-user-id',
    tenantId: 'test-tenant-id',
    isSuperAdmin: overrides.isSuperAdmin ?? false,
    email: 'test@test.com',
    roles: [],
    permissions: overrides.permissions ?? [],
  });
}

// ── Default mock return values (safe empty responses) ─────────────────────────
beforeEach(() => {
  const m = getMock();
  m.project.findMany.mockResolvedValue([]);
  m.project.count.mockResolvedValue(0);
  m.project.groupBy.mockResolvedValue([]);
  m.project.findFirst.mockResolvedValue(null);
  m.followUp.groupBy.mockResolvedValue([]);
  m.followUp.findMany.mockResolvedValue([]);
  m.workflowTemplate.findMany.mockResolvedValue([]);
  m.workflowTemplate.findFirst.mockResolvedValue(null);
  m.auditLog.findMany.mockResolvedValue([]);
  m.auditLog.count.mockResolvedValue(0);
  m.projectStage.findMany.mockResolvedValue([]);
  m.stageHistory.findMany.mockResolvedValue([]);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth middleware', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for malformed token', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('Permission checks — projects', () => {
  it('returns 403 without projects:view permission', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token({ permissions: [] })}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with projects:view permission', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token({ permissions: ['projects:view'] })}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
  });

  it('returns 200 with projects:view_all permission', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token({ permissions: ['projects:view_all'] })}`);
    expect(res.status).toBe(200);
  });
});

describe('Permission checks — reports', () => {
  it('returns 403 without reports:view permission', async () => {
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token({ permissions: ['projects:view'] })}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with reports:view permission', async () => {
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token({ permissions: ['reports:view'] })}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.kpi).toBeDefined();
  });
});

describe('Permission checks — audit logs', () => {
  it('returns 403 without reports:view', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${token({ permissions: [] })}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with reports:view', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${token({ permissions: ['reports:view'] })}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Permission checks — documents', () => {
  it('returns 403 without documents:download', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${token({ permissions: [] })}`);
    expect(res.status).toBe(403);
  });
});

describe('Permission checks — workflows management', () => {
  it('GET /api/workflows returns 200 without special permission (read is open)', async () => {
    const res = await request(app)
      .get('/api/workflows')
      .set('Authorization', `Bearer ${token({ permissions: [] })}`);
    expect(res.status).toBe(200);
  });

  it('POST /api/workflows returns 403 without workflows:manage', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${token({ permissions: [] })}`)
      .send({ name: 'Test', stages: [{ key: 'k', name: 'n', order: 1 }] });
    expect(res.status).toBe(403);
  });
});

describe('Super admin bypasses all permission checks', () => {
  it('super admin can access projects without projects:view', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token({ isSuperAdmin: true, permissions: [] })}`);
    expect(res.status).toBe(200);
  });

  it('super admin can access reports without reports:view', async () => {
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token({ isSuperAdmin: true, permissions: [] })}`);
    expect(res.status).toBe(200);
  });
});

describe('Workflow stage format — Layer 2 contract test', () => {
  it('stages always have .key and .name defined (normalizes seed format)', async () => {
    const m = getMock();
    // Simulate seed data format: stageKey/stageName instead of key/name
    m.workflowTemplate.findMany.mockResolvedValueOnce([
      {
        id: 'wf-1',
        tenantId: 'test-tenant-id',
        name: 'Test Workflow',
        description: null,
        isDefault: true,
        stages: [
          { stageKey: 'file_creation', stageName: 'File Creation', order: 1 },
          { stageKey: 'inward', stageName: 'Inward', order: 2 },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { projects: 0 },
      },
    ]);

    const res = await request(app)
      .get('/api/workflows')
      .set('Authorization', `Bearer ${token({ permissions: [] })}`);

    expect(res.status).toBe(200);
    const stages = res.body.data[0].stages as Array<{ key: string; name: string }>;
    expect(stages).toHaveLength(2);
    // Contract: .key and .name must always be defined strings
    for (const stage of stages) {
      expect(typeof stage.key).toBe('string');
      expect(typeof stage.name).toBe('string');
      expect(stage.key).not.toBe('');
      expect(stage.name).not.toBe('');
    }
    expect(stages[0].key).toBe('file_creation');
    expect(stages[0].name).toBe('File Creation');
  });

  it('stages in API format (key/name) also work correctly', async () => {
    const m = getMock();
    m.workflowTemplate.findMany.mockResolvedValueOnce([
      {
        id: 'wf-2',
        tenantId: 'test-tenant-id',
        name: 'API Workflow',
        description: null,
        isDefault: false,
        stages: [
          { key: 'stage_1', name: 'Stage One', order: 1 },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { projects: 0 },
      },
    ]);

    const res = await request(app)
      .get('/api/workflows')
      .set('Authorization', `Bearer ${token({ permissions: [] })}`);

    const stages = res.body.data[0].stages as Array<{ key: string; name: string }>;
    expect(stages[0].key).toBe('stage_1');
    expect(stages[0].name).toBe('Stage One');
  });
});
