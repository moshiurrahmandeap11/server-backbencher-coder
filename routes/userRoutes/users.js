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

// Validate user data with UID
const validateUserData = (data, isUpdate = false) => {
  const errors = [];
  
  if (!isUpdate) {
    if (!data.name || data.name.trim().length < 2) {
      errors.push("Name must be at least 2 characters");
    }
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push("Valid email is required");
    }
    if (!data.uid) {
      errors.push("UID is required");
    }
  } else {
    if (data.name && data.name.trim().length < 2) {
      errors.push("Name must be at least 2 characters");
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push("Valid email is required");
    }
  }
  
  return errors;
};

// Generate user response
const generateUserResponse = (user) => {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

/* ==========================
   GET All Users
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
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { uid: { $regex: search, $options: "i" } }
      ];
    }
    
    // Get total count for pagination
    const totalUsers = await db.collection("users").countDocuments(query);
    const totalPages = Math.ceil(totalUsers / parseInt(limit));
    
    // Get users with pagination and sorting
    const users = await db.collection("users")
      .find(query)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    // Remove passwords from response
    const safeUsers = users.map(user => generateUserResponse(user));
    
    res.json({
      success: true,
      data: safeUsers,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalUsers,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch users" 
    });
  }
});

/* ==========================
   GET Single User by ID
========================== */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if it's ObjectId or UID
    let query;
    if (ObjectId.isValid(id)) {
      query = { _id: new ObjectId(id) };
    } else {
      // UID দিয়ে খুঁজবে
      query = { uid: id };
    }
    
    const user = await db.collection("users").findOne(query);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }
    
    res.json({
      success: true,
      data: generateUserResponse(user)
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch user" 
    });
  }
});

/* ==========================
   GET User by UID (Firebase UID)
========================== */

router.get("/uid/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    
    if (!uid || uid.trim() === "") {
      return res.status(400).json({ 
        success: false, 
        error: "UID is required" 
      });
    }
    
    const user = await db.collection("users").findOne({ 
      uid: uid
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found with this UID" 
      });
    }
    
    res.json({
      success: true,
      data: generateUserResponse(user)
    });
  } catch (error) {
    console.error("Error fetching user by UID:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch user" 
    });
  }
});

/* ==========================
   GET User by Email
========================== */

router.get("/email/:email", async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: "Email is required" 
      });
    }
    
    const user = await db.collection("users").findOne({ 
      email: email.toLowerCase() 
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }
    
    res.json({
      success: true,
      data: generateUserResponse(user)
    });
  } catch (error) {
    console.error("Error fetching user by email:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch user" 
    });
  }
});

/* ==========================
   POST Create User (with UID and image upload)
========================== */

router.post("/", upload.single("profileImage"), async (req, res) => {
  try {
    const userData = req.body;
    const file = req.file;
    
    // Validate required fields (UID সহ)
    const validationErrors = validateUserData(userData);
    if (validationErrors.length > 0) {
      // Delete uploaded file if validation fails
      if (file) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({ 
        success: false, 
        errors: validationErrors 
      });
    }
    
    // Check if user already exists by UID
    const existingUserByUid = await db.collection("users").findOne({ 
      uid: userData.uid
    });
    
    if (existingUserByUid) {
      if (file) fs.unlinkSync(file.path);
      return res.status(409).json({ 
        success: false, 
        error: "User with this UID already exists" 
      });
    }
    
    // Check if user already exists by email
    const existingUserByEmail = await db.collection("users").findOne({ 
      email: userData.email.toLowerCase() 
    });
    
    if (existingUserByEmail) {
      if (file) fs.unlinkSync(file.path);
      return res.status(409).json({ 
        success: false, 
        error: "User with this email already exists" 
      });
    }
    
    // Prepare user object with only required fields
    const newUser = {
      uid: userData.uid, // Firebase UID
      name: userData.name.trim(),
      email: userData.email.toLowerCase(),
      phone: userData.phone || "",
      profileImage: file 
        ? `/uploads/images/${file.filename}` 
        : userData.profileImage || "",
      
      // Optional additional data if provided
      ...(userData.role && { role: userData.role }),
      ...(userData.bio && { bio: userData.bio }),
      
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date(),
      
      // Authentication fields
      emailVerified: userData.emailVerified || false
    };
    
    // Insert user
    const result = await db.collection("users").insertOne(newUser);
    
    // Get the created user
    const createdUser = await db.collection("users").findOne({ 
      _id: result.insertedId 
    });
    
    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: generateUserResponse(createdUser)
    });
  } catch (error) {
    console.error("Error creating user:", error);
    // Delete uploaded file on error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      success: false, 
      error: "Failed to create user" 
    });
  }
});

/* ==========================
   PUT Update User (with image upload)
========================== */

router.put("/:id", upload.single("profileImage"), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const file = req.file;
    
    // Check if it's ObjectId or UID
    let query;
    if (ObjectId.isValid(id)) {
      query = { _id: new ObjectId(id) };
    } else {
      query = { uid: id };
    }
    
    // Validate update data
    const validationErrors = validateUserData(updateData, true);
    if (validationErrors.length > 0) {
      if (file) fs.unlinkSync(file.path);
      return res.status(400).json({ 
        success: false, 
        errors: validationErrors 
      });
    }
    
    // Check if user exists
    const existingUser = await db.collection("users").findOne(query);
    
    if (!existingUser) {
      if (file) fs.unlinkSync(file.path);
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }
    
    // Check email uniqueness if email is being updated
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailQuery = ObjectId.isValid(id) 
        ? { email: updateData.email.toLowerCase(), _id: { $ne: new ObjectId(id) } }
        : { email: updateData.email.toLowerCase(), uid: { $ne: id } };
      
      const emailExists = await db.collection("users").findOne(emailQuery);
      
      if (emailExists) {
        if (file) fs.unlinkSync(file.path);
        return res.status(409).json({ 
          success: false, 
          error: "Email already in use" 
        });
      }
    }
    
    // Prepare update object
    const updateObject = {};
    
    // Update basic fields
    if (updateData.name) updateObject.name = updateData.name.trim();
    if (updateData.email) updateObject.email = updateData.email.toLowerCase();
    if (updateData.phone !== undefined) updateObject.phone = updateData.phone;
    
    // Handle profile image
    if (file) {
      // Delete old image if exists
      if (existingUser.profileImage && existingUser.profileImage.includes("/uploads/images/")) {
        const oldImagePath = path.join(__dirname, "..", "..", "public", existingUser.profileImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updateObject.profileImage = `/uploads/images/${file.filename}`;
    } else if (updateData.profileImage === "") {
      // Allow clearing profile image
      if (existingUser.profileImage && existingUser.profileImage.includes("/uploads/images/")) {
        const oldImagePath = path.join(__dirname, "..", "..", "public", existingUser.profileImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updateObject.profileImage = "";
    }
    
    // Update timestamps
    updateObject.updatedAt = new Date();
    
    // Perform update
    const result = await db.collection("users").updateOne(
      query,
      { $set: updateObject }
    );
    
    if (result.matchedCount === 0) {
      if (file) fs.unlinkSync(file.path);
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }
    
    // Get updated user
    const updatedUser = await db.collection("users").findOne(query);
    
    res.json({
      success: true,
      message: "User updated successfully",
      data: generateUserResponse(updatedUser)
    });
  } catch (error) {
    console.error("Error updating user:", error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      success: false, 
      error: "Failed to update user" 
    });
  }
});

/* ==========================
   PATCH Partial Update User
========================== */

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Check if it's ObjectId or UID
    let query;
    if (ObjectId.isValid(id)) {
      query = { _id: new ObjectId(id) };
    } else {
      query = { uid: id };
    }
    
    // Only allow specific fields for patch
    const allowedFields = [
      "name", "email", "phone", "profileImage"
    ];
    
    const updateObject = {};
    
    // Build update object with allowed fields only
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        updateObject[key] = updateData[key];
      }
    });
    
    // Add timestamp
    updateObject.updatedAt = new Date();
    
    const result = await db.collection("users").updateOne(
      query,
      { $set: updateObject }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }
    
    res.json({
      success: true,
      message: "User updated successfully",
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Error patching user:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update user" 
    });
  }
});

/* ==========================
   DELETE User
========================== */

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if it's ObjectId or UID
    let query;
    if (ObjectId.isValid(id)) {
      query = { _id: new ObjectId(id) };
    } else {
      query = { uid: id };
    }
    
    // Get user first to delete profile image
    const user = await db.collection("users").findOne(query);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }
    
    // Delete profile image if exists
    if (user.profileImage && user.profileImage.includes("/uploads/images/")) {
      const imagePath = path.join(__dirname, "..", "..", "public", user.profileImage);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Delete user from database
    const result = await db.collection("users").deleteOne(query);
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }
    
    res.json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete user" 
    });
  }
});

/* ==========================
   Upload Profile Image Only
========================== */

router.post("/:id/upload-image", upload.single("profileImage"), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if it's ObjectId or UID
    let query;
    if (ObjectId.isValid(id)) {
      query = { _id: new ObjectId(id) };
    } else {
      query = { uid: id };
    }
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: "No image file uploaded" 
      });
    }
    
    // Check if user exists
    const user = await db.collection("users").findOne(query);
    
    if (!user) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }
    
    // Delete old image if exists
    if (user.profileImage && user.profileImage.includes("/uploads/images/")) {
      const oldImagePath = path.join(__dirname, "..", "..", "public", user.profileImage);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    
    // Update user with new image path
    const imageUrl = `/uploads/images/${req.file.filename}`;
    
    await db.collection("users").updateOne(
      query,
      { 
        $set: { 
          profileImage: imageUrl,
          updatedAt: new Date() 
        } 
      }
    );
    
    res.json({
      success: true,
      message: "Profile image uploaded successfully",
      data: {
        profileImage: imageUrl,
        imageName: req.file.filename,
        imageSize: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      success: false, 
      error: "Failed to upload profile image" 
    });
  }
});

export default router;