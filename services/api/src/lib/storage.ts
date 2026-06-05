import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800', 10); // 50MB default

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getUploadPath(tenantId: string, projectId: string, stageId?: string): string {
  const dir = stageId
    ? path.join(UPLOAD_DIR, tenantId, projectId, stageId)
    : path.join(UPLOAD_DIR, tenantId, projectId);
  ensureDir(dir);
  return dir;
}

export function deleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to delete file:', error);
  }
}

export function getFileStats(filePath: string): { size: number; exists: boolean } {
  try {
    const stats = fs.statSync(filePath);
    return { size: stats.size, exists: true };
  } catch {
    return { size: 0, exists: false };
  }
}

export function generateFileName(originalName: string): string {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 50);
  return `${baseName}_${uuidv4().split('-')[0]}${ext}`;
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(UPLOAD_DIR);
    cb(null, UPLOAD_DIR); // Will be moved to proper location after upload
  },
  filename: (_req, file, cb) => {
    cb(null, generateFileName(file.originalname));
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // Block dangerous file types
    const dangerousTypes = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (dangerousTypes.includes(ext)) {
      cb(new Error(`File type ${ext} is not allowed`));
    } else {
      cb(null, true);
    }
  },
});

export function moveFile(from: string, to: string): void {
  ensureDir(path.dirname(to));
  fs.renameSync(from, to);
}

export function getRelativePath(absolutePath: string): string {
  return absolutePath.replace(UPLOAD_DIR, '').replace(/^\//, '');
}

export function getAbsolutePath(relativePath: string): string {
  return path.join(UPLOAD_DIR, relativePath);
}
