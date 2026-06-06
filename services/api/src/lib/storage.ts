import path from 'path';
import { Readable } from 'stream';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import multer from 'multer';

// Configure Cloudinary from env vars
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800', 10); // 50 MB

const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js'];

// Use memory storage — buffer is uploaded to Cloudinary in the route handler
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      cb(new Error(`File type ${ext} is not allowed`));
    } else {
      cb(null, true);
    }
  },
});

export interface CloudinaryUploadResult {
  url: string;       // secure_url — stored in document.filePath
  publicId: string;  // public_id  — stored in document.fileName (used for deletion)
}

/**
 * Upload a buffer to Cloudinary.
 * @param buffer  File buffer from multer memoryStorage
 * @param folder  Cloudinary folder path, e.g. "flowtiq/tenantId/projectId"
 * @param originalName  Original filename — used as display hint for the public_id
 */
export function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  originalName: string,
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    // Sanitize originalName to a safe Cloudinary-friendly base name
    const baseName = path.basename(originalName, path.extname(originalName))
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 60);

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'raw', // treats all files as binary (PDFs, docs, images, etc.)
        use_filename: false,
        public_id: `${baseName}_${Date.now()}`,
        overwrite: false,
      },
      (error, result: UploadApiResponse | undefined) => {
        if (error || !result) {
          return reject(error || new Error('Cloudinary upload failed'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}

/**
 * Delete a file from Cloudinary by its public_id.
 * Called when a document is hard-deleted or a version is replaced.
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
  } catch (err) {
    // Non-fatal — log and continue
    console.error('Cloudinary delete error:', err);
  }
}
