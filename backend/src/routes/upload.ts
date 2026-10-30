import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateAgent, AuthenticatedRequest } from '../services/auth';

const router = Router();
const UPLOAD_DIR = path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `agent_${base}_${unique}${ext}`);
  },
});

// Allowed file types: images and common documents
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only images and PDFs/Docs are supported.`));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter,
});

/**
 * POST /api/upload
 * Staff file upload endpoint
 */
router.post(
  '/',
  authenticateAgent,
  upload.single('file'),
  (req: AuthenticatedRequest, res: Response): void => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const isImage = req.file.mimetype.startsWith('image/');

    res.json({
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      type: isImage ? 'image' : 'file',
    });
  }
);

export default router;
