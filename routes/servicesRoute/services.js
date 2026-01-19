import { Router } from "express";
import fs from "fs";
import { ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from 'url';
import { db } from "../../db/connectDB.js";
import upload from "../../middleware/upload.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

/* ==========================
   Helper Functions
========================== */

// Generate service response
const generateServiceResponse = (service) => {
  return {
    _id: service._id,
    title: service.title,
    images: service.images || [],
    description: service.description,
    features: service.features || [],
    price: service.price,
    deliveryTime: service.deliveryTime,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt
  };
};

// Delete service images
const deleteServiceImages = async (service) => {
  if (service.images && Array.isArray(service.images)) {
    service.images.forEach(imagePath => {
      if (imagePath && imagePath.includes("/uploads/images/")) {
        const fullPath = path.join(__dirname, "..", "..", "public", imagePath);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
          } catch (error) {
            console.error(`Error deleting image ${imagePath}:`, error);
          }
        }
      }
    });
  }
};

/* ==========================
   GET All Services
========================== */

router.get("/", async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = "", 
      sortBy = "createdAt", 
      sortOrder = "desc" 
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};
    
    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }
    
    // Get total count for pagination
    const totalServices = await db.collection("services").countDocuments(query);
    const totalPages = Math.ceil(totalServices / parseInt(limit));
    
    // Get services with pagination and sorting
    const services = await db.collection("services")
      .find(query)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    res.json({
      success: true,
      data: services.map(service => generateServiceResponse(service)),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalServices,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch services" 
    });
  }
});

/* ==========================
   GET Single Service by ID
========================== */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid service ID" 
      });
    }
    
    const service = await db.collection("services").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        error: "Service not found" 
      });
    }
    
    res.json({
      success: true,
      data: generateServiceResponse(service)
    });
  } catch (error) {
    console.error("Error fetching service:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch service" 
    });
  }
});

/* ==========================
   POST Create Service (with multiple image upload)
========================== */

router.post("/", upload.array("images", 10), async (req, res) => {
  try {
    const serviceData = req.body;
    const files = req.files || [];
    
    // Parse features from string to array
    let features = [];
    if (serviceData.features) {
      if (typeof serviceData.features === 'string') {
        features = serviceData.features.split('\n').map(feature => feature.trim()).filter(feature => feature !== '');
      } else if (Array.isArray(serviceData.features)) {
        features = serviceData.features;
      }
    }
    
    // Handle images
    const images = files.map(file => `/uploads/images/${file.filename}`);
    
    // Prepare service object
    const newService = {
      title: serviceData.title || "",
      description: serviceData.description || "",
      features: features,
      price: parseFloat(serviceData.price) || 0,
      deliveryTime: serviceData.deliveryTime || "",
      images: images,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Insert service
    const result = await db.collection("services").insertOne(newService);
    
    // Get the created service
    const createdService = await db.collection("services").findOne({ 
      _id: result.insertedId 
    });
    
    res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: generateServiceResponse(createdService)
    });
  } catch (error) {
    console.error("Error creating service:", error);
    
    // Delete uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to create service" 
    });
  }
});

/* ==========================
   PUT Update Service (with image upload)
========================== */

router.put("/:id", upload.array("images", 10), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const files = req.files || [];
    
    if (!ObjectId.isValid(id)) {
      // Delete uploaded files if ID is invalid
      if (files.length > 0) {
        files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(400).json({ 
        success: false, 
        error: "Invalid service ID" 
      });
    }
    
    // Check if service exists
    const existingService = await db.collection("services").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!existingService) {
      // Delete uploaded files if service doesn't exist
      if (files.length > 0) {
        files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(404).json({ 
        success: false, 
        error: "Service not found" 
      });
    }
    
    // Parse features
    let features = existingService.features;
    if (updateData.features) {
      if (typeof updateData.features === 'string') {
        features = updateData.features.split('\n').map(feature => feature.trim()).filter(feature => feature !== '');
      } else if (Array.isArray(updateData.features)) {
        features = updateData.features;
      }
    }
    
    // Handle images
    let images = existingService.images || [];
    if (files.length > 0) {
      // Add new images
      const newImages = files.map(file => `/uploads/images/${file.filename}`);
      images = [...images, ...newImages];
    }
    
    // If deleteImages field is provided, remove those images
    if (updateData.deleteImages && Array.isArray(updateData.deleteImages)) {
      updateData.deleteImages.forEach(imagePath => {
        // Delete from filesystem
        if (imagePath.includes("/uploads/images/")) {
          const fullPath = path.join(__dirname, "..", "..", "public", imagePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        }
        // Remove from images array
        images = images.filter(img => img !== imagePath);
      });
    }
    
    // Prepare update object
    const updateObject = {
      ...(updateData.title && { title: updateData.title }),
      ...(updateData.description && { description: updateData.description }),
      ...(updateData.price && { price: parseFloat(updateData.price) }),
      ...(updateData.deliveryTime && { deliveryTime: updateData.deliveryTime }),
      features: features,
      images: images,
      updatedAt: new Date()
    };
    
    // Perform update
    const result = await db.collection("services").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateObject }
    );
    
    if (result.matchedCount === 0) {
      // Delete uploaded files if update failed
      if (files.length > 0) {
        files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(404).json({ 
        success: false, 
        error: "Service not found" 
      });
    }
    
    // Get updated service
    const updatedService = await db.collection("services").findOne({ 
      _id: new ObjectId(id) 
    });
    
    res.json({
      success: true,
      message: "Service updated successfully",
      data: generateServiceResponse(updatedService)
    });
  } catch (error) {
    console.error("Error updating service:", error);
    
    // Delete uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to update service" 
    });
  }
});

/* ==========================
   PATCH Partial Update Service
========================== */

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid service ID" 
      });
    }
    
    // Check if service exists
    const existingService = await db.collection("services").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!existingService) {
      return res.status(404).json({ 
        success: false, 
        error: "Service not found" 
      });
    }
    
    // Only update provided fields
    const updateObject = {};
    
    // Build update object
    if (updateData.title !== undefined) updateObject.title = updateData.title;
    if (updateData.description !== undefined) updateObject.description = updateData.description;
    if (updateData.price !== undefined) updateObject.price = parseFloat(updateData.price);
    if (updateData.deliveryTime !== undefined) updateObject.deliveryTime = updateData.deliveryTime;
    
    // Handle features
    if (updateData.features !== undefined) {
      let features = [];
      if (typeof updateData.features === 'string') {
        features = updateData.features.split('\n').map(feature => feature.trim()).filter(feature => feature !== '');
      } else if (Array.isArray(updateData.features)) {
        features = updateData.features;
      }
      updateObject.features = features;
    }
    
    // Update timestamp
    updateObject.updatedAt = new Date();
    
    // Perform update
    const result = await db.collection("services").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateObject }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Service not found" 
      });
    }
    
    // Get updated service
    const updatedService = await db.collection("services").findOne({ 
      _id: new ObjectId(id) 
    });
    
    res.json({
      success: true,
      message: "Service updated successfully",
      data: generateServiceResponse(updatedService)
    });
  } catch (error) {
    console.error("Error patching service:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update service" 
    });
  }
});

/* ==========================
   DELETE Service
========================== */

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid service ID" 
      });
    }
    
    // Get service first to delete images
    const service = await db.collection("services").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        error: "Service not found" 
      });
    }
    
    // Delete service images
    await deleteServiceImages(service);
    
    // Delete service from database
    const result = await db.collection("services").deleteOne({ 
      _id: new ObjectId(id) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Service not found" 
      });
    }
    
    res.json({
      success: true,
      message: "Service deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting service:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete service" 
    });
  }
});

/* ==========================
   Upload Images Only
========================== */

router.post("/:id/upload-images", upload.array("images", 10), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      if (req.files) {
        req.files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(400).json({ 
        success: false, 
        error: "Invalid service ID" 
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "No image files uploaded" 
      });
    }
    
    // Check if service exists
    const service = await db.collection("services").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!service) {
      req.files.forEach(file => fs.unlinkSync(file.path));
      return res.status(404).json({ 
        success: false, 
        error: "Service not found" 
      });
    }
    
    // Get existing images
    const existingImages = service.images || [];
    
    // Add new images
    const newImages = req.files.map(file => `/uploads/images/${file.filename}`);
    const allImages = [...existingImages, ...newImages];
    
    // Update service with new images
    await db.collection("services").updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          images: allImages,
          updatedAt: new Date() 
        } 
      }
    );
    
    res.json({
      success: true,
      message: "Images uploaded successfully",
      data: {
        images: newImages,
        totalImages: allImages.length
      }
    });
  } catch (error) {
    console.error("Error uploading images:", error);
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    res.status(500).json({ 
      success: false, 
      error: "Failed to upload images" 
    });
  }
});

/* ==========================
   Delete Specific Images
========================== */

router.post("/:id/delete-images", async (req, res) => {
  try {
    const { id } = req.params;
    const { imagesToDelete } = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid service ID" 
      });
    }
    
    if (!imagesToDelete || !Array.isArray(imagesToDelete) || imagesToDelete.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "No images specified for deletion" 
      });
    }
    
    // Check if service exists
    const service = await db.collection("services").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        error: "Service not found" 
      });
    }
    
    const existingImages = service.images || [];
    
    // Delete images from filesystem
    imagesToDelete.forEach(imagePath => {
      if (imagePath && imagePath.includes("/uploads/images/")) {
        const fullPath = path.join(__dirname, "..", "..", "public", imagePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    });
    
    // Filter out deleted images
    const updatedImages = existingImages.filter(img => !imagesToDelete.includes(img));
    
    // Update service
    await db.collection("services").updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          images: updatedImages,
          updatedAt: new Date() 
        } 
      }
    );
    
    res.json({
      success: true,
      message: "Images deleted successfully",
      data: {
        deletedCount: imagesToDelete.length,
        remainingImages: updatedImages.length
      }
    });
  } catch (error) {
    console.error("Error deleting images:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete images" 
    });
  }
});

export default router;