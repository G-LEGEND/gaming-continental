// routes/livescore.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// ===== Schema =====
const livescoreSchema = new mongoose.Schema(
  {
    tournament: { type: String, required: true },
    link: { type: String, required: true }
  },
  { timestamps: true }
);

const Livescore = mongoose.model("Livescore", livescoreSchema);

// ===== Routes =====

// ✅ Get all livescores (users will call this)
router.get("/", async (req, res) => {
  try {
    const scores = await Livescore.find().sort({ createdAt: -1 });
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch livescores" });
  }
});

// ✅ Add a new livescore (admin only)
router.post("/", async (req, res) => {
  try {
    const { tournament, link } = req.body;
    if (!tournament || !link) {
      return res.status(400).json({ error: "Tournament and link required" });
    }
    const newScore = new Livescore({ tournament, link });
    await newScore.save();
    res.json({ message: "Livescore added", livescore: newScore });
  } catch (err) {
    res.status(500).json({ error: "Failed to add livescore" });
  }
});

// ✅ Delete a livescore (admin only)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Livescore.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Livescore not found" });
    }
    res.json({ message: "Livescore deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete livescore" });
  }
});

module.exports = router;