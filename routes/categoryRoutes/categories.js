import { Router } from "express";
import { ObjectId } from "mongodb";
import { db } from "../../db/connectDB.js";

const router = Router();

/* ==========================
   Helper Functions
========================== */

// Generate category response
const generateCategoryResponse = (category) => {
  return {
    _id: category._id,
    name: category.name,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  };
};

/* ==========================
   GET All Categories
========================== */

router.get("/", async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = "", 
      sortBy = "name", 
      sortOrder = "asc" 
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};
    
    // Search functionality
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    
    // Get total count for pagination
    const totalCategories = await db.collection("categories").countDocuments(query);
    const totalPages = Math.ceil(totalCategories / parseInt(limit));
    
    // Get categories with pagination and sorting
    const categories = await db.collection("categories")
      .find(query)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    res.json({
      success: true,
      data: categories.map(category => generateCategoryResponse(category)),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCategories,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch categories" 
    });
  }
});

/* ==========================
   GET Single Category by ID
========================== */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid category ID" 
      });
    }
    
    const category = await db.collection("categories").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!category) {
      return res.status(404).json({ 
        success: false, 
        error: "Category not found" 
      });
    }
    
    res.json({
      success: true,
      data: generateCategoryResponse(category)
    });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch category" 
    });
  }
});

/* ==========================
   POST Create Category
========================== */

router.post("/", async (req, res) => {
  try {
    const { name } = req.body;
    
    // Prepare category object
    const newCategory = {
      name: name || "",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Insert category
    const result = await db.collection("categories").insertOne(newCategory);
    
    // Get the created category
    const createdCategory = await db.collection("categories").findOne({ 
      _id: result.insertedId 
    });
    
    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: generateCategoryResponse(createdCategory)
    });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to create category" 
    });
  }
});

/* ==========================
   PUT Update Category
========================== */

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid category ID" 
      });
    }
    
    // Check if category exists
    const existingCategory = await db.collection("categories").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!existingCategory) {
      return res.status(404).json({ 
        success: false, 
        error: "Category not found" 
      });
    }
    
    // Prepare update object
    const updateObject = {
      ...(name && { name: name }),
      updatedAt: new Date()
    };
    
    // Perform update
    const result = await db.collection("categories").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateObject }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Category not found" 
      });
    }
    
    // Get updated category
    const updatedCategory = await db.collection("categories").findOne({ 
      _id: new ObjectId(id) 
    });
    
    res.json({
      success: true,
      message: "Category updated successfully",
      data: generateCategoryResponse(updatedCategory)
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update category" 
    });
  }
});

/* ==========================
   PATCH Partial Update Category
========================== */

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid category ID" 
      });
    }
    
    // Check if category exists
    const existingCategory = await db.collection("categories").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!existingCategory) {
      return res.status(404).json({ 
        success: false, 
        error: "Category not found" 
      });
    }
    
    // Only update provided fields
    const updateObject = {
      ...(name !== undefined && { name: name }),
      updatedAt: new Date()
    };
    
    // Perform update
    const result = await db.collection("categories").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateObject }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Category not found" 
      });
    }
    
    // Get updated category
    const updatedCategory = await db.collection("categories").findOne({ 
      _id: new ObjectId(id) 
    });
    
    res.json({
      success: true,
      message: "Category updated successfully",
      data: generateCategoryResponse(updatedCategory)
    });
  } catch (error) {
    console.error("Error patching category:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update category" 
    });
  }
});

/* ==========================
   DELETE Category
========================== */

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid category ID" 
      });
    }
    
    // Check if category exists
    const category = await db.collection("categories").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!category) {
      return res.status(404).json({ 
        success: false, 
        error: "Category not found" 
      });
    }
    
    // Check if category is being used in products
    const productsUsingCategory = await db.collection("products").countDocuments({
      category: id
    });
    
    if (productsUsingCategory > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete category. It is being used by ${productsUsingCategory} product(s).`
      });
    }
    
    // Delete category from database
    const result = await db.collection("categories").deleteOne({ 
      _id: new ObjectId(id) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Category not found" 
      });
    }
    
    res.json({
      success: true,
      message: "Category deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete category" 
    });
  }
});

/* ==========================
   Bulk Create Categories
========================== */

router.post("/bulk", async (req, res) => {
  try {
    const { categories } = req.body;
    
    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ 
        success: false, 
        error: "Categories array is required" 
      });
    }
    
    // Prepare categories with timestamps
    const categoriesToInsert = categories.map(name => ({
      name: name || "",
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    // Insert categories
    const result = await db.collection("categories").insertMany(categoriesToInsert);
    
    // Get created categories
    const insertedIds = Object.values(result.insertedIds);
    const createdCategories = await db.collection("categories")
      .find({ _id: { $in: insertedIds } })
      .toArray();
    
    res.status(201).json({
      success: true,
      message: `${categoriesToInsert.length} categories created successfully`,
      data: createdCategories.map(category => generateCategoryResponse(category))
    });
  } catch (error) {
    console.error("Error creating bulk categories:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to create categories" 
    });
  }
});

/* ==========================
   Search Categories
========================== */

router.get("/search/:term", async (req, res) => {
  try {
    const { term } = req.params;
    
    if (!term || term.trim() === "") {
      return res.json({
        success: true,
        data: []
      });
    }
    
    const categories = await db.collection("categories")
      .find({ 
        name: { $regex: term, $options: "i" } 
      })
      .limit(20)
      .toArray();
    
    res.json({
      success: true,
      data: categories.map(category => generateCategoryResponse(category))
    });
  } catch (error) {
    console.error("Error searching categories:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to search categories" 
    });
  }
});

export default router;