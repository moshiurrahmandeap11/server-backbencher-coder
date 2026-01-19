import { Router } from "express";
import { ObjectId } from "mongodb";
import { db } from "../../db/connectDB.js";

const router = Router();

/* ==========================
   Helper Functions
========================== */

// Generate contact response
const generateContactResponse = (contact) => {
  return {
    _id: contact._id,
    name: contact.name,
    email: contact.email,
    subject: contact.subject,
    message: contact.message,
    status: contact.status,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt
  };
};

/* ==========================
   GET All Contacts (with pagination, search, sort)
========================== */

router.get("/", async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = "", 
      status = "", 
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
        { subject: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } }
      ];
    }
    
    // Filter by status
    if (status && ["pending", "read", "replied", "archived"].includes(status)) {
      query.status = status;
    }
    
    // Get total count for pagination
    const totalContacts = await db.collection("contacts").countDocuments(query);
    const totalPages = Math.ceil(totalContacts / parseInt(limit));
    
    // Get contacts with pagination and sorting
    const contacts = await db.collection("contacts")
      .find(query)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    res.json({
      success: true,
      data: contacts.map(contact => generateContactResponse(contact)),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalContacts,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch contacts" 
    });
  }
});

/* ==========================
   GET Single Contact by ID
========================== */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid contact ID" 
      });
    }
    
    const contact = await db.collection("contacts").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!contact) {
      return res.status(404).json({ 
        success: false, 
        error: "Contact not found" 
      });
    }
    
    res.json({
      success: true,
      data: generateContactResponse(contact)
    });
  } catch (error) {
    console.error("Error fetching contact:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch contact" 
    });
  }
});

/* ==========================
   POST Create Contact (Contact Form Submission)
========================== */

router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: "All fields are required"
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid email address"
      });
    }
    
    // Prepare contact object
    const newContact = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message,
      status: "pending", // pending, read, replied, archived
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Insert contact
    const result = await db.collection("contacts").insertOne(newContact);
    
    // Get the created contact
    const createdContact = await db.collection("contacts").findOne({ 
      _id: result.insertedId 
    });
    
    res.status(201).json({
      success: true,
      message: "Thank you for contacting us. We'll get back to you soon.",
      data: generateContactResponse(createdContact)
    });
  } catch (error) {
    console.error("Error creating contact:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to submit contact form" 
    });
  }
});

/* ==========================
   PUT Update Contact
========================== */

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, subject, message, status } = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid contact ID" 
      });
    }
    
    // Check if contact exists
    const existingContact = await db.collection("contacts").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!existingContact) {
      return res.status(404).json({ 
        success: false, 
        error: "Contact not found" 
      });
    }
    
    // Email validation if email is being updated
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: "Please enter a valid email address"
        });
      }
    }
    
    // Status validation
    if (status && !["pending", "read", "replied", "archived"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status value"
      });
    }
    
    // Prepare update object
    const updateObject = {
      ...(name && { name: name.trim() }),
      ...(email && { email: email.trim().toLowerCase() }),
      ...(subject && { subject: subject.trim() }),
      ...(message && { message: message }),
      ...(status && { status: status }),
      updatedAt: new Date()
    };
    
    // Perform update
    const result = await db.collection("contacts").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateObject }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Contact not found" 
      });
    }
    
    // Get updated contact
    const updatedContact = await db.collection("contacts").findOne({ 
      _id: new ObjectId(id) 
    });
    
    res.json({
      success: true,
      message: "Contact updated successfully",
      data: generateContactResponse(updatedContact)
    });
  } catch (error) {
    console.error("Error updating contact:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update contact" 
    });
  }
});

/* ==========================
   PATCH Partial Update Contact (Update Status)
========================== */

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, subject, message, status } = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid contact ID" 
      });
    }
    
    // Check if contact exists
    const existingContact = await db.collection("contacts").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!existingContact) {
      return res.status(404).json({ 
        success: false, 
        error: "Contact not found" 
      });
    }
    
    // Email validation if email is being updated
    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: "Please enter a valid email address"
        });
      }
    }
    
    // Status validation
    if (status !== undefined && !["pending", "read", "replied", "archived"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status value"
      });
    }
    
    // Only update provided fields
    const updateObject = {
      ...(name !== undefined && { name: name.trim() }),
      ...(email !== undefined && { email: email.trim().toLowerCase() }),
      ...(subject !== undefined && { subject: subject.trim() }),
      ...(message !== undefined && { message: message }),
      ...(status !== undefined && { status: status }),
      updatedAt: new Date()
    };
    
    // Perform update
    const result = await db.collection("contacts").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateObject }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Contact not found" 
      });
    }
    
    // Get updated contact
    const updatedContact = await db.collection("contacts").findOne({ 
      _id: new ObjectId(id) 
    });
    
    res.json({
      success: true,
      message: "Contact updated successfully",
      data: generateContactResponse(updatedContact)
    });
  } catch (error) {
    console.error("Error patching contact:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update contact" 
    });
  }
});

/* ==========================
   DELETE Contact
========================== */

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid contact ID" 
      });
    }
    
    // Check if contact exists
    const contact = await db.collection("contacts").findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!contact) {
      return res.status(404).json({ 
        success: false, 
        error: "Contact not found" 
      });
    }
    
    // Delete contact from database
    const result = await db.collection("contacts").deleteOne({ 
      _id: new ObjectId(id) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Contact not found" 
      });
    }
    
    res.json({
      success: true,
      message: "Contact deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete contact" 
    });
  }
});

/* ==========================
   DELETE Multiple Contacts
========================== */

router.delete("/", async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Array of contact IDs is required" 
      });
    }
    
    // Validate all IDs
    const validIds = ids.filter(id => ObjectId.isValid(id));
    const invalidIds = ids.filter(id => !ObjectId.isValid(id));
    
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid contact IDs: ${invalidIds.join(', ')}`
      });
    }
    
    // Convert string IDs to ObjectId
    const objectIds = validIds.map(id => new ObjectId(id));
    
    // Delete contacts
    const result = await db.collection("contacts").deleteMany({
      _id: { $in: objectIds }
    });
    
    res.json({
      success: true,
      message: `${result.deletedCount} contact(s) deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error deleting multiple contacts:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete contacts" 
    });
  }
});

/* ==========================
   Bulk Create Contacts
========================== */

router.post("/bulk", async (req, res) => {
  try {
    const { contacts } = req.body;
    
    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ 
        success: false, 
        error: "Contacts array is required" 
      });
    }
    
    // Validate each contact
    const validatedContacts = [];
    const errors = [];
    
    contacts.forEach((contact, index) => {
      const { name, email, subject, message } = contact;
      
      if (!name || !email || !subject || !message) {
        errors.push(`Contact ${index + 1}: All fields are required`);
        return;
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push(`Contact ${index + 1}: Invalid email address`);
        return;
      }
      
      validatedContacts.push({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject: subject.trim(),
        message: message,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: errors
      });
    }
    
    // Insert contacts
    const result = await db.collection("contacts").insertMany(validatedContacts);
    
    // Get created contacts
    const insertedIds = Object.values(result.insertedIds);
    const createdContacts = await db.collection("contacts")
      .find({ _id: { $in: insertedIds } })
      .toArray();
    
    res.status(201).json({
      success: true,
      message: `${validatedContacts.length} contacts created successfully`,
      data: createdContacts.map(contact => generateContactResponse(contact))
    });
  } catch (error) {
    console.error("Error creating bulk contacts:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to create contacts" 
    });
  }
});

/* ==========================
   Get Contacts Statistics
========================== */

router.get("/stats/summary", async (req, res) => {
  try {
    const totalContacts = await db.collection("contacts").countDocuments();
    
    const statusStats = await db.collection("contacts").aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    
    // Convert status stats to object
    const statusCounts = {};
    statusStats.forEach(stat => {
      statusCounts[stat._id] = stat.count;
    });
    
    // Get today's contacts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayContacts = await db.collection("contacts").countDocuments({
      createdAt: { $gte: today }
    });
    
    // Get this week's contacts
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);
    
    const weeklyContacts = await db.collection("contacts").countDocuments({
      createdAt: { $gte: oneWeekAgo }
    });
    
    // Get monthly contacts
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    oneMonthAgo.setHours(0, 0, 0, 0);
    
    const monthlyContacts = await db.collection("contacts").countDocuments({
      createdAt: { $gte: oneMonthAgo }
    });
    
    res.json({
      success: true,
      data: {
        total: totalContacts,
        today: todayContacts,
        weekly: weeklyContacts,
        monthly: monthlyContacts,
        byStatus: {
          pending: statusCounts.pending || 0,
          read: statusCounts.read || 0,
          replied: statusCounts.replied || 0,
          archived: statusCounts.archived || 0
        }
      }
    });
  } catch (error) {
    console.error("Error fetching contact statistics:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch contact statistics" 
    });
  }
});

/* ==========================
   Search Contacts
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
    
    const contacts = await db.collection("contacts")
      .find({ 
        $or: [
          { name: { $regex: term, $options: "i" } },
          { email: { $regex: term, $options: "i" } },
          { subject: { $regex: term, $options: "i" } }
        ]
      })
      .limit(20)
      .toArray();
    
    res.json({
      success: true,
      data: contacts.map(contact => generateContactResponse(contact))
    });
  } catch (error) {
    console.error("Error searching contacts:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to search contacts" 
    });
  }
});

export default router;