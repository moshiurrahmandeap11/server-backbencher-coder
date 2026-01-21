import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDB } from './db/connectDB.js';
import badges from "./routes/badgesRoute/badges.js";
import categories from "./routes/categoryRoutes/categories.js";
import contact from "./routes/contactRoutes/contact.js";
import products from "./routes/productsRoutes/products.js";
import services from "./routes/servicesRoute/services.js";
import subscribe from "./routes/subscribeRoute/subscribe.js";
import users from "./routes/userRoutes/users.js";

// For ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Create uploads directories if they don't exist
const createUploadsDirectories = () => {
  const directories = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'uploads', 'images'),
    path.join(__dirname, 'uploads', 'docs'),
    path.join(__dirname, 'uploads', 'others')
  ];
  
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    }
  });
};

// Create directories on startup
createUploadsDirectories();

// Middleware
app.use(cors({
    origin: '*',
    credentials: false
}));
app.use(express.json());

// Serve static files from uploads directory - IMPORTANT: Use /api/uploads path
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Also serve from root /uploads for backward compatibility
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static files from public directory (if exists)
if (fs.existsSync(path.join(__dirname, 'public'))) {
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api/public', express.static(path.join(__dirname, 'public')));
}

// db connect
await connectDB();

// routes
app.use("/api/users", users);
app.use("/api/products", products);
app.use("/api/categories", categories);
app.use("/api/badges", badges);
app.use("/api/services", services);
app.use("/api/contact", contact);
app.use("/api/subscribe", subscribe);

// Basic route
app.get('/', (req, res) => {
    res.json({ 
        message: 'Backbencher Coder API is running',
        version: '1.0.0',
        status: 'active',
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const uploadsStatus = {
    images: fs.existsSync(path.join(__dirname, 'uploads', 'images')),
    docs: fs.existsSync(path.join(__dirname, 'uploads', 'docs')),
    others: fs.existsSync(path.join(__dirname, 'uploads', 'others'))
  };
  
  res.json({ 
    status: 'healthy',
    database: 'connected',
    uploads: uploadsStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Cleanup old files endpoint (optional - for maintenance)
app.delete('/cleanup-temp-files', (req, res) => {
  try {
    const cleanupDir = (dirPath, maxAgeHours = 24) => {
      let deletedCount = 0;
      const files = fs.readdirSync(dirPath);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;
      
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;
        
        if (fileAge > maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`Deleted old file: ${filePath}`);
        }
      });
      
      return deletedCount;
    };
    
    const imagesDeleted = cleanupDir(path.join(__dirname, 'uploads', 'images'));
    const docsDeleted = cleanupDir(path.join(__dirname, 'uploads', 'docs'));
    const othersDeleted = cleanupDir(path.join(__dirname, 'uploads', 'others'));
    
    res.json({
      success: true,
      message: 'Temporary files cleanup completed',
      deleted: {
        images: imagesDeleted,
        docs: docsDeleted,
        others: othersDeleted,
        total: imagesDeleted + docsDeleted + othersDeleted
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      message: error.message
    });
  }
});

// Test uploads access endpoint
app.get('/api/uploads/test', (req, res) => {
  const imagesPath = path.join(__dirname, 'uploads', 'images');
  const files = fs.existsSync(imagesPath) ? fs.readdirSync(imagesPath) : [];
  
  res.json({
    success: true,
    message: 'Uploads directory accessible',
    totalFiles: files.length,
    files: files.slice(0, 10), // Show first 10 files
    paths: {
      absolutePath: imagesPath,
      urlPath: '/api/uploads/images/',
      exampleUrl: files[0] ? `/api/uploads/images/${files[0]}` : 'No files yet'
    }
  });
});

// 404 handler (NO PATH)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  
  // Handle multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'File too large',
      message: 'Maximum file size is 10MB'
    });
  }
  
  if (err.message === 'File type not allowed') {
    return res.status(415).json({
      success: false,
      error: 'Unsupported file type',
      message: 'Allowed types: images (jpeg, png, webp, gif), docs (pdf, doc, docx), others (zip, txt)'
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Uploads accessible at: http://localhost:${PORT}/api/uploads/`);
    console.log(`📁 Uploads also at: http://localhost:${PORT}/uploads/`);
});