const mongoose = require("mongoose");

const LiveScoreSchema = new mongoose.Schema(
  {
    tournament: { type: String, required: true },
    link: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("LiveScore", LiveScoreSchema);