import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../lib/storage';
import { sendPushNotification } from '../lib/push';

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
    const { projectWorkflowId: qWorkflowId } = req.query as Record<string, string>;
    if (qWorkflowId) where.projectWorkflowId = qWorkflowId;
    if (search) {
      where.OR = [
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
          projectWorkflow: { select: { id: true, name: true } },
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

      const { projectId, stageId, projectWorkflowId, tags } = req.body;

      if (!projectId) {
        res.status(400).json({ success: false, error: 'projectId is required' });
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: tenantId as string },
      });

      if (!project) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }

      // Upload buffer to Cloudinary
      const folder = stageId
        ? `flowtiq/${tenantId}/${projectId}/${stageId}`
        : projectWorkflowId
          ? `flowtiq/${tenantId}/${projectId}/wf_${projectWorkflowId}`
          : `flowtiq/${tenantId}/${projectId}`;

      const { url, publicId } = await uploadToCloudinary(
        req.file.buffer,
        folder,
        req.file.originalname,
      );

      const document = await prisma.document.create({
        data: {
          tenantId: tenantId as string,
          projectId,
          projectWorkflowId: projectWorkflowId || null,
          stageId: stageId || null,
          fileName: publicId,                          // Cloudinary public_id (for deletion)
          originalName: req.file.originalname,
          fileType: req.file.originalname.split('.').pop()?.toUpperCase() || 'FILE',
          fileSize: BigInt(req.file.size),
          filePath: url,                               // Cloudinary secure_url (for download)
          mimeType: req.file.mimetype,
          uploadedById: userId,
          tags: tags ? JSON.parse(tags) : [],
        },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true, projectNumber: true } },
          stage: { select: { id: true, stageName: true } },
          projectWorkflow: { select: { id: true, name: true } },
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

      // AC-6: Push for document upload — notify all project team members
      const projectMembers = await prisma.project.findUnique({
        where: { id: projectId },
        select: { ownerId: true, teamMembers: true, tenantId: true, name: true },
      });
      if (projectMembers) {
        const recipients = Array.from(new Set([projectMembers.ownerId, ...projectMembers.teamMembers]));
        for (const uid of recipients) {
          await prisma.notification.create({
            data: {
              tenantId: projectMembers.tenantId,
              userId: uid,
              type: 'document',
              title: 'Document Uploaded',
              message: `A new document was uploaded to ${projectMembers.name}`,
              data: { documentId: document.id, projectId },
            },
          });
          sendPushNotification(uid, projectMembers.tenantId, {
            title: 'Document Uploaded',
            body: `A new document was uploaded to ${projectMembers.name}`,
            eventType: 'document_uploaded',
            entityType: 'document',
            entityId: document.id,
            deepLinkUrl: '/documents',
          }, 'documentUploads');
        }
      }

      res.status(201).json({
        success: true,
        data: { ...document, fileSize: Number(document.fileSize) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/documents/:id/download
// Redirects to the Cloudinary secure URL — browser handles the download
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

    await createAuditLog({
      req: authReq,
      action: 'DOWNLOADED',
      module: 'documents',
      entityId: document.id,
      entityType: 'document',
      entityName: document.originalName,
    });

    // filePath is now the Cloudinary secure_url
    res.redirect(document.filePath);
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
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const newVersion = document.version + 1;

      const folder = document.stageId
        ? `flowtiq/${tenantId}/${document.projectId}/${document.stageId}`
        : document.projectWorkflowId
          ? `flowtiq/${tenantId}/${document.projectId}/wf_${document.projectWorkflowId}`
          : `flowtiq/${tenantId}/${document.projectId}`;

      const { url, publicId } = await uploadToCloudinary(
        req.file.buffer,
        folder,
        req.file.originalname,
      );

      // Save version history (keeps old Cloudinary URL accessible for version downloads)
      await prisma.documentVersion.create({
        data: {
          documentId: document.id,
          version: document.version,
          filePath: document.filePath,   // old Cloudinary URL
          fileSize: document.fileSize,
          uploadedById: userId,
          notes: req.body.notes,
        },
      });

      const updated = await prisma.document.update({
        where: { id: req.params.id },
        data: {
          fileName: publicId,
          originalName: req.file.originalname,
          fileSize: BigInt(req.file.size),
          filePath: url,
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
        previousData: { version: document.version, fileName: document.originalName },
        newData: { version: newVersion, fileName: req.file.originalname },
      });

      res.json({ success: true, data: { ...updated, fileSize: Number(updated.fileSize) } });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/documents/:id
// Soft-deletes in DB and removes from Cloudinary
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

    // Delete from Cloudinary (fileName holds the public_id)
    await deleteFromCloudinary(document.fileName);

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
