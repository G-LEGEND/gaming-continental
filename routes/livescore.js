// routes/livescore.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// ===== Use the existing model from models/LiveScore.js =====
const Livescore = mongoose.models.LiveScore || mongoose.model("LiveScore", new mongoose.Schema({
  tournament: { type: String, required: true },
  link: { type: String, required: true }
}, { timestamps: true }));

// ===== Routes =====

// ✅ Get all livescores (public - no auth needed)
router.get("/", async (req, res) => {
  try {
    console.log("📥 Fetching all live scores...");
    const scores = await Livescore.find().sort({ createdAt: -1 });
    console.log(`✅ Found ${scores.length} live scores`);
    res.json(scores);
  } catch (err) {
    console.error("❌ Failed to fetch livescores:", err);
    res.status(500).json({ error: "Failed to fetch livescores" });
  }
});

// ✅ Add a new livescore
router.post("/", async (req, res) => {
  try {
    const { tournament, link } = req.body;
    console.log("📥 Adding new live score:", { tournament, link });
    
    if (!tournament || !link) {
      return res.status(400).json({ error: "Tournament and link required" });
    }

    // Validate URL format
    try {
      new URL(link);
    } catch (urlError) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    const newScore = new Livescore({ tournament, link });
    await newScore.save();
    
    console.log(`✅ New live score added: ${tournament}`);
    res.json({ 
      message: "Live score added successfully ✅", 
      livescore: newScore 
    });
  } catch (err) {
    console.error("❌ Failed to add livescore:", err);
    res.status(500).json({ error: "Failed to add livescore" });
  }
});

// ✅ Delete a livescore
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📥 Deleting live score: ${id}`);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const deleted = await Livescore.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Live score not found" });
    }
    
    console.log(`✅ Live score deleted: ${id}`);
    res.json({ message: "Live score deleted successfully ✅" });
  } catch (err) {
    console.error("❌ Failed to delete livescore:", err);
    res.status(500).json({ error: "Failed to delete livescore" });
  }
});

module.exports = router;