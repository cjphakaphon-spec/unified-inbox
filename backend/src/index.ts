import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { pool } from './db';
import lineWebhookRouter from './routes/lineWebhook';
import messengerWebhookRouter from './routes/messengerWebhook';
import conversationsRouter from './routes/conversations';
import authRouter from './routes/auth';
import uploadRouter from './routes/upload';
import { seedInitialAgent } from './services/auth';

dotenv.config();

export interface CustomRequest extends Request {
  rawBody?: Buffer;
}

const app = express();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());

// Middleware to capture raw body for HMAC signature verification
app.use(
  express.json({
    verify: (req: CustomRequest, _res: Response, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: true }));

// Serve uploaded media files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Webhook routes
app.use('/webhook/line', lineWebhookRouter);
app.use('/webhook/messenger', messengerWebhookRouter);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/conversations', conversationsRouter);

// Health check endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  try {
    const result = await pool.query('SELECT NOW()');
    if (result.rows.length > 0) {
      dbStatus = 'connected';
    }
  } catch {
    dbStatus = 'error';
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

// Serve frontend static build in production
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req: Request, res: Response, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/webhook') ||
      req.path.startsWith('/uploads')
    ) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Socket.IO connection event
io.on('connection', (socket) => {
  console.log(`🔌 Client connected to WebSocket: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected from WebSocket: ${socket.id}`);
  });
});

export { app, server, io };

const PORT = process.env.PORT || 3000;

if (require.main === module && process.env.NODE_ENV !== 'test') {
  server.listen(PORT, async () => {
    console.log(`🚀 Unified Inbox backend running on port ${PORT}`);
    console.log(`📡 Health check available at http://localhost:${PORT}/api/health`);
    await seedInitialAgent();
  });
}
