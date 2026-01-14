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

// Generate product response
const generateProductResponse = (product) => {
  return {
    _id: product._id,
    name: product.name,
    category: product.category,
    price: product.price,
    originalPrice: product.originalPrice,
    description: product.description,
    features: product.features || [],
    badge: product.badge,
    images: product.images || [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
};

// Delete product images
const deleteProductImages = async (product) => {
  if (product.images && Array.isArray(product.images)) {
    product.images.forEach(imagePath => {
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
   GET All Products
========================== */

router.get("/", async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = "", 
      category = "",
      sortBy = "createdAt", 
      sortOrder = "desc" 
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Get total count for pagination
    const totalProducts = await db.collection("products").countDocuments(query);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));
    
    // Get products with pagination and sorting
    const products = await db.collection("products")
      .find(query)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    res.json({
      success: true,
      data: products.map(product => generateProductResponse(product)),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch products" 
    });
  }
});

/* ==========================
   GET Single Product by ID
========================== */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid product ID" 
      });
    }
    
    const product = await db.collection("products").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: "Product not found" 
      });
    }
    
    res.json({
      success: true,
      data: generateProductResponse(product)
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch product" 
    });
  }
});

/* ==========================
   POST Create Product (with multiple image upload)
========================== */

router.post("/", upload.array("images", 10), async (req, res) => {
  try {
    const productData = req.body;
    const files = req.files || [];
    
    // Parse features from string to array (if sent as string)
    let features = [];
    if (productData.features) {
      if (typeof productData.features === 'string') {
        features = productData.features.split(',').map(feature => feature.trim()).filter(feature => feature !== '');
      } else if (Array.isArray(productData.features)) {
        features = productData.features;
      }
    }
    
    // Handle images
    const images = files.map(file => `/uploads/images/${file.filename}`);
    
    // Prepare product object
    const newProduct = {
      name: productData.name || "",
      category: productData.category || "",
      price: parseFloat(productData.price) || 0,
      originalPrice: parseFloat(productData.originalPrice) || 0,
      description: productData.description || "",
      features: features,
      badge: productData.badge || "",
      images: images,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Insert product
    const result = await db.collection("products").insertOne(newProduct);
    
    // Get the created product
    const createdProduct = await db.collection("products").findOne({ 
      _id: result.insertedId 
    });
    
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: generateProductResponse(createdProduct)
    });
  } catch (error) {
    console.error("Error creating product:", error);
    
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
      error: "Failed to create product" 
    });
  }
});

/* ==========================
   PUT Update Product (with image upload)
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
        error: "Invalid product ID" 
      });
    }
    
    // Check if product exists
    const existingProduct = await db.collection("products").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!existingProduct) {
      // Delete uploaded files if product doesn't exist
      if (files.length > 0) {
        files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(404).json({ 
        success: false, 
        error: "Product not found" 
      });
    }
    
    // Parse features
    let features = existingProduct.features;
    if (updateData.features) {
      if (typeof updateData.features === 'string') {
        features = updateData.features.split(',').map(feature => feature.trim()).filter(feature => feature !== '');
      } else if (Array.isArray(updateData.features)) {
        features = updateData.features;
      }
    }
    
    // Handle images
    let images = existingProduct.images || [];
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
      ...(updateData.name && { name: updateData.name }),
      ...(updateData.category && { category: updateData.category }),
      ...(updateData.price && { price: parseFloat(updateData.price) }),
      ...(updateData.originalPrice && { originalPrice: parseFloat(updateData.originalPrice) }),
      ...(updateData.description && { description: updateData.description }),
      ...(updateData.badge && { badge: updateData.badge }),
      features: features,
      images: images,
      updatedAt: new Date()
    };
    
    // Perform update
    const result = await db.collection("products").updateOne(
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
        error: "Product not found" 
      });
    }
    
    // Get updated product
    const updatedProduct = await db.collection("products").findOne({ 
      _id: new ObjectId(id) 
    });
    
    res.json({
      success: true,
      message: "Product updated successfully",
      data: generateProductResponse(updatedProduct)
    });
  } catch (error) {
    console.error("Error updating product:", error);
    
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
      error: "Failed to update product" 
    });
  }
});

/* ==========================
   PATCH Partial Update Product
========================== */

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid product ID" 
      });
    }
    
    // Check if product exists
    const existingProduct = await db.collection("products").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!existingProduct) {
      return res.status(404).json({ 
        success: false, 
        error: "Product not found" 
      });
    }
    
    // Only update provided fields
    const updateObject = {};
    
    // Build update object
    if (updateData.name !== undefined) updateObject.name = updateData.name;
    if (updateData.category !== undefined) updateObject.category = updateData.category;
    if (updateData.price !== undefined) updateObject.price = parseFloat(updateData.price);
    if (updateData.originalPrice !== undefined) updateObject.originalPrice = parseFloat(updateData.originalPrice);
    if (updateData.description !== undefined) updateObject.description = updateData.description;
    if (updateData.badge !== undefined) updateObject.badge = updateData.badge;
    
    // Handle features
    if (updateData.features !== undefined) {
      let features = [];
      if (typeof updateData.features === 'string') {
        features = updateData.features.split(',').map(feature => feature.trim()).filter(feature => feature !== '');
      } else if (Array.isArray(updateData.features)) {
        features = updateData.features;
      }
      updateObject.features = features;
    }
    
    // Update timestamp
    updateObject.updatedAt = new Date();
    
    // Perform update
    const result = await db.collection("products").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateObject }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Product not found" 
      });
    }
    
    // Get updated product
    const updatedProduct = await db.collection("products").findOne({ 
      _id: new ObjectId(id) 
    });
    
    res.json({
      success: true,
      message: "Product updated successfully",
      data: generateProductResponse(updatedProduct)
    });
  } catch (error) {
    console.error("Error patching product:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update product" 
    });
  }
});

/* ==========================
   DELETE Product
========================== */

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid product ID" 
      });
    }
    
    // Get product first to delete images
    const product = await db.collection("products").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: "Product not found" 
      });
    }
    
    // Delete product images
    await deleteProductImages(product);
    
    // Delete product from database
    const result = await db.collection("products").deleteOne({ 
      _id: new ObjectId(id) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Product not found" 
      });
    }
    
    res.json({
      success: true,
      message: "Product deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete product" 
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
        error: "Invalid product ID" 
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "No image files uploaded" 
      });
    }
    
    // Check if product exists
    const product = await db.collection("products").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!product) {
      req.files.forEach(file => fs.unlinkSync(file.path));
      return res.status(404).json({ 
        success: false, 
        error: "Product not found" 
      });
    }
    
    // Get existing images
    const existingImages = product.images || [];
    
    // Add new images
    const newImages = req.files.map(file => `/uploads/images/${file.filename}`);
    const allImages = [...existingImages, ...newImages];
    
    // Update product with new images
    await db.collection("products").updateOne(
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
        error: "Invalid product ID" 
      });
    }
    
    if (!imagesToDelete || !Array.isArray(imagesToDelete) || imagesToDelete.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "No images specified for deletion" 
      });
    }
    
    // Check if product exists
    const product = await db.collection("products").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: "Product not found" 
      });
    }
    
    const existingImages = product.images || [];
    
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
    
    // Update product
    await db.collection("products").updateOne(
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