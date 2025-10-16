const express = require("express");
const router = express.Router();
const LiveStream = require("../models/LiveStream");

// ✅ GET /livestream - Get all active live streams (PUBLIC)
router.get("/", async (req, res) => {
  try {
    const streams = await LiveStream.find({ isActive: true })
      .sort({ createdAt: -1 });
    
    res.json(streams);
  } catch (err) {
    console.error("Error fetching live streams:", err);
    res.status(500).json({ error: "Failed to fetch live streams" });
  }
});

// ✅ POST /livestream - Add new live stream (ADMIN ONLY - with session validation)
router.post("/", async (req, res) => {
  try {
    const { tournament, link, description, email } = req.body;
    
    // Check admin session
    const loggedInAdmins = req.app.get('loggedInAdmins');
    if (!email || !loggedInAdmins || !loggedInAdmins.has(email)) {
      return res.status(403).json({ error: "Admin not logged in" });
    }
    
    if (!tournament || !link) {
      return res.status(400).json({ error: "Tournament title and YouTube link are required" });
    }

    // Validate YouTube URL
    if (!link.includes('youtube.com/live/') && !link.includes('youtu.be/')) {
      return res.status(400).json({ error: "Please provide a valid YouTube Live URL" });
    }

    const newStream = await LiveStream.create({
      tournament,
      link,
      description: description || 'Watch this exciting live gaming tournament',
      createdBy: email // Store admin email instead of ObjectId
    });

    res.status(201).json({ 
      message: "Live stream added successfully ✅", 
      stream: newStream 
    });
  } catch (err) {
    console.error("Error adding live stream:", err);
    res.status(500).json({ error: "Failed to add live stream: " + err.message });
  }
});

// ✅ DELETE /livestream/:id - Delete live stream (ADMIN ONLY - with session validation)
router.delete("/:id", async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check admin session
    const loggedInAdmins = req.app.get('loggedInAdmins');
    if (!email || !loggedInAdmins || !loggedInAdmins.has(email)) {
      return res.status(403).json({ error: "Admin not logged in" });
    }

    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ error: "Live stream not found" });
    }

    await LiveStream.findByIdAndDelete(req.params.id);
    
    res.json({ message: "Live stream deleted successfully ✅" });
  } catch (err) {
    console.error("Error deleting live stream:", err);
    res.status(500).json({ error: "Failed to delete live stream" });
  }
});

// ✅ PUT /livestream/:id - Update live stream (ADMIN ONLY - with session validation)
router.put("/:id", async (req, res) => {
  try {
    const { tournament, link, description, isActive, email } = req.body;
    
    // Check admin session
    const loggedInAdmins = req.app.get('loggedInAdmins');
    if (!email || !loggedInAdmins || !loggedInAdmins.has(email)) {
      return res.status(403).json({ error: "Admin not logged in" });
    }
    
    const stream = await LiveStream.findById(req.params.id);
    if (!stream) {
      return res.status(404).json({ error: "Live stream not found" });
    }

    const updatedStream = await LiveStream.findByIdAndUpdate(
      req.params.id,
      { 
        tournament, 
        link, 
        description, 
        isActive 
      },
      { new: true, runValidators: true }
    );

    res.json({ 
      message: "Live stream updated successfully ✅", 
      stream: updatedStream 
    });
  } catch (err) {
    console.error("Error updating live stream:", err);
    res.status(500).json({ error: "Failed to update live stream" });
  }
});

module.exports = router;