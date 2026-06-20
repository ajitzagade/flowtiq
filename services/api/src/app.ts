import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { tenantsRouter } from './routes/tenants';
import { usersRouter } from './routes/users';
import { rolesRouter } from './routes/roles';
import { projectsRouter } from './routes/projects';
import { stagesRouter } from './routes/stages';
import { followupsRouter } from './routes/followups';
import { documentsRouter } from './routes/documents';
import { workflowsRouter } from './routes/workflows';
import { auditRouter } from './routes/audit';
import { notificationsRouter } from './routes/notifications';
import { dashboardRouter } from './routes/dashboard';
import { reportsRouter } from './routes/reports';
import { seedRouter } from './routes/seed';
import { projectWorkflowsRouter } from './routes/project-workflows';
import { deviceTokenRouter } from './routes/deviceTokens';
import { notificationPreferencesRouter } from './routes/notificationPreferences';

export const app = express();

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some((o) => origin === o || origin.endsWith('.vercel.app'))) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
}));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'flowtiq-api' });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/stages', stagesRouter);
app.use('/api/follow-ups', followupsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/project-workflows', projectWorkflowsRouter);
app.use('/api/seed', seedRouter);
app.use('/api/users', deviceTokenRouter);
app.use('/api/users', notificationPreferencesRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler (must be last)
app.use(errorHandler);
