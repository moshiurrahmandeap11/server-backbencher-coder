import { Router } from "express";
import { db } from "../../db/connectDB.js";

const router = Router();

/* ==========================
   Helper Functions
========================== */

// Generate subscription response
const generateSubscriptionResponse = (subscription) => {
  return {
    _id: subscription._id,
    email: subscription.email,
    subscribedAt: subscription.subscribedAt,
    isActive: subscription.isActive || true
  };
};

// Email validation regex
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/* ==========================
   POST - Create new subscription
========================== */

router.post("/", async (req, res) => {
  try {
    const { email } = req.body;
    
    // Validate email presence
    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid email address"
      });
    }
    
    // Check if email already exists
    const existingSubscription = await db.collection("subscribers").findOne({ 
      email: email.toLowerCase().trim() 
    });
    
    if (existingSubscription) {
      return res.status(409).json({
        success: false,
        error: "This email is already subscribed"
      });
    }
    
    // Prepare subscription object
    const newSubscription = {
      email: email.toLowerCase().trim(),
      subscribedAt: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Insert subscription
    const result = await db.collection("subscribers").insertOne(newSubscription);
    
    // Get the created subscription
    const createdSubscription = await db.collection("subscribers").findOne({ 
      _id: result.insertedId 
    });
    
    res.status(201).json({
      success: true,
      message: "Successfully subscribed to newsletter!",
      data: generateSubscriptionResponse(createdSubscription)
    });
    
  } catch (error) {
    console.error("Subscription error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to subscribe. Please try again."
    });
  }
});

/* ==========================
   GET - Get all subscribers (Admin only)
========================== */

router.get("/", async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = "", 
      sortBy = "subscribedAt", 
      sortOrder = "desc" 
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};
    
    // Search functionality
    if (search) {
      query.email = { $regex: search, $options: "i" };
    }
    
    // Get total count for pagination
    const totalSubscribers = await db.collection("subscribers").countDocuments(query);
    const totalPages = Math.ceil(totalSubscribers / parseInt(limit));
    
    // Get subscribers with pagination and sorting
    const subscribers = await db.collection("subscribers")
      .find(query)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    res.json({
      success: true,
      data: subscribers.map(subscription => generateSubscriptionResponse(subscription)),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalSubscribers,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error("Error fetching subscribers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch subscribers"
    });
  }
});

/* ==========================
   DELETE - Unsubscribe by email
========================== */

router.delete("/:email", async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }
    
    // URL decode email
    const decodedEmail = decodeURIComponent(email).toLowerCase().trim();
    
    // Validate email format
    if (!isValidEmail(decodedEmail)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email address"
      });
    }
    
    // Check if subscription exists
    const existingSubscription = await db.collection("subscribers").findOne({ 
      email: decodedEmail 
    });
    
    if (!existingSubscription) {
      return res.status(404).json({
        success: false,
        error: "Email not found in subscription list"
      });
    }
    
    // Soft delete - Update isActive to false
    const result = await db.collection("subscribers").updateOne(
      { email: decodedEmail },
      { 
        $set: { 
          isActive: false,
          unsubscribedAt: new Date(),
          updatedAt: new Date()
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Subscription not found"
      });
    }
    
    res.json({
      success: true,
      message: "Successfully unsubscribed from newsletter"
    });
    
  } catch (error) {
    console.error("Unsubscribe error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to unsubscribe. Please try again."
    });
  }
});

/* ==========================
   GET - Check subscription status by email
========================== */

router.get("/check/:email", async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }
    
    const decodedEmail = decodeURIComponent(email).toLowerCase().trim();
    
    if (!isValidEmail(decodedEmail)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email address"
      });
    }
    
    const subscription = await db.collection("subscribers").findOne({ 
      email: decodedEmail 
    });
    
    res.json({
      success: true,
      data: {
        isSubscribed: !!subscription?.isActive,
        subscriptionDate: subscription?.subscribedAt,
        email: decodedEmail
      }
    });
    
  } catch (error) {
    console.error("Check subscription error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check subscription status"
    });
  }
});

/* ==========================
   GET - Get active subscribers count
========================== */

router.get("/count/active", async (req, res) => {
  try {
    const activeCount = await db.collection("subscribers").countDocuments({ 
      isActive: true 
    });
    
    const totalCount = await db.collection("subscribers").countDocuments();
    
    res.json({
      success: true,
      data: {
        activeSubscribers: activeCount,
        totalSubscribers: totalCount,
        inactiveSubscribers: totalCount - activeCount
      }
    });
    
  } catch (error) {
    console.error("Count subscribers error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to count subscribers"
    });
  }
});

export default router;