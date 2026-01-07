import fs from "fs";
import multer from "multer";
import path from "path";

/* ==========================
   Allowed file types
========================== */

const FILE_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  doc: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  other: ["application/zip", "text/plain"],
};

/* ==========================
   Storage logic
========================== */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "others";

    if (FILE_TYPES.image.includes(file.mimetype)) {
      folder = "images";
    } else if (FILE_TYPES.doc.includes(file.mimetype)) {
      folder = "docs";
    }

    const uploadPath = path.join("uploads", folder);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});

/* ==========================
   File filter (security)
========================== */

const fileFilter = (req, file, cb) => {
  const allowedTypes = Object.values(FILE_TYPES).flat();

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("File type not allowed"), false);
  }

  cb(null, true);
};

/* ==========================
   Final upload middleware
========================== */

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

export default upload;



