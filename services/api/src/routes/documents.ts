import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';
import { upload, getUploadPath, moveFile, deleteFile } from '../lib/storage';

export const documentsRouter = Router();
documentsRouter.use(authenticate);

// GET /api/documents
documentsRouter.get('/', requirePermission('documents:download'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;
    const {
      page = '1', pageSize = '20', projectId, stageId, search,
      sortBy = 'createdAt', sortOrder = 'desc',
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where: Record<string, unknown> = {
      tenantId: tenantId as string,
      isActive: true,
    };
    if (projectId) where.projectId = projectId;
    if (stageId) where.stageId = stageId;
    if (search) {
      where.OR = [
        { fileName: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { [sortBy]: sortOrder },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true, projectNumber: true } },
          stage: { select: { id: true, stageName: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: documents.map((d) => ({ ...d, fileSize: Number(d.fileSize) })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/upload
documentsRouter.post(
  '/upload',
  requirePermission('documents:upload'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const authReq = req as AuthRequest;
      const { tenantId, userId } = authReq.user;

      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const { projectId, stageId, tags } = req.body;

      if (!projectId) {
        res.status(400).json({ success: false, error: 'projectId is required' });
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: tenantId as string },
      });

      if (!project) {
        deleteFile(req.file.path);
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }

      // Move file to proper location
      const destDir = getUploadPath(tenantId as string, projectId, stageId);
      const destPath = path.join(destDir, req.file.filename);
      moveFile(req.file.path, destPath);

      const relativePath = `${tenantId}/${projectId}/${stageId || ''}/${req.file.filename}`.replace('//', '/');

      const document = await prisma.document.create({
        data: {
          tenantId: tenantId as string,
          projectId,
          stageId: stageId || null,
          fileName: req.file.filename,
          originalName: req.file.originalname,
          fileType: path.extname(req.file.originalname).slice(1).toUpperCase(),
          fileSize: BigInt(req.file.size),
          filePath: relativePath,
          mimeType: req.file.mimetype,
          uploadedById: userId,
          tags: tags ? JSON.parse(tags) : [],
        },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true, projectNumber: true } },
          stage: { select: { id: true, stageName: true } },
        },
      });

      // Update tenant storage usage
      await prisma.tenant.update({
        where: { id: tenantId as string },
        data: { usedStorageBytes: { increment: BigInt(req.file.size) } },
      });

      await createAuditLog({
        req: authReq,
        action: 'UPLOADED',
        module: 'documents',
        entityId: document.id,
        entityType: 'document',
        entityName: req.file.originalname,
        newData: { fileName: req.file.originalname, fileSize: req.file.size, projectId },
      });

      res.status(201).json({
        success: true,
        data: { ...document, fileSize: Number(document.fileSize) },
      });
    } catch (err) {
      if (req.file) deleteFile(req.file.path);
      next(err);
    }
  }
);

// GET /api/documents/:id/download
documentsRouter.get('/:id/download', requirePermission('documents:download'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const document = await prisma.document.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string, isActive: true },
    });

    if (!document) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const absolutePath = path.join(uploadDir, document.filePath);

    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({ success: false, error: 'File not found on storage' });
      return;
    }

    await createAuditLog({
      req: authReq,
      action: 'DOWNLOADED',
      module: 'documents',
      entityId: document.id,
      entityType: 'document',
      entityName: document.originalName,
    });

    res.download(absolutePath, document.originalName);
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/:id/replace
documentsRouter.post(
  '/:id/replace',
  requirePermission('documents:upload'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const authReq = req as AuthRequest;
      const { tenantId, userId } = authReq.user;

      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const document = await prisma.document.findFirst({
        where: { id: req.params.id, tenantId: tenantId as string, isActive: true },
      });

      if (!document) {
        deleteFile(req.file.path);
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const newVersion = document.version + 1;
      const destDir = getUploadPath(tenantId as string, document.projectId, document.stageId || undefined);
      const destPath = path.join(destDir, req.file.filename);
      moveFile(req.file.path, destPath);

      const relativePath = `${tenantId}/${document.projectId}/${document.stageId || ''}/${req.file.filename}`.replace('//', '/');

      // Save version history
      await prisma.documentVersion.create({
        data: {
          documentId: document.id,
          version: document.version,
          filePath: document.filePath,
          fileSize: document.fileSize,
          uploadedById: userId,
          notes: req.body.notes,
        },
      });

      const updated = await prisma.document.update({
        where: { id: req.params.id },
        data: {
          fileName: req.file.filename,
          originalName: req.file.originalname,
          fileSize: BigInt(req.file.size),
          filePath: relativePath,
          mimeType: req.file.mimetype,
          version: newVersion,
          uploadedById: userId,
        },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await createAuditLog({
        req: authReq,
        action: 'REPLACED',
        module: 'documents',
        entityId: document.id,
        entityType: 'document',
        entityName: document.originalName,
        previousData: { version: document.version, fileName: document.fileName },
        newData: { version: newVersion, fileName: req.file.originalname },
      });

      res.json({ success: true, data: { ...updated, fileSize: Number(updated.fileSize) } });
    } catch (err) {
      if (req.file) deleteFile(req.file.path);
      next(err);
    }
  }
);

// DELETE /api/documents/:id
documentsRouter.delete('/:id', requirePermission('documents:delete'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const document = await prisma.document.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
    });

    if (!document) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    await prisma.document.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    await createAuditLog({
      req: authReq,
      action: 'DELETED',
      module: 'documents',
      entityId: document.id,
      entityType: 'document',
      entityName: document.originalName,
    });

    res.json({ success: true, message: 'Document deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/versions
documentsRouter.get('/:id/versions', requirePermission('documents:download'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const document = await prisma.document.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
    });

    if (!document) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: req.params.id },
      orderBy: { version: 'desc' },
    });

    res.json({ success: true, data: versions });
  } catch (err) {
    next(err);
  }
});
