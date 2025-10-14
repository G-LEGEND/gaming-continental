// models/Match.js
const mongoose = require("mongoose");

const MatchSchema = new mongoose.Schema({
  home: { type: String, required: true },
  away: { type: String, required: true },
  date: String,
  time: String,
  odds: Object,
  homeGoals: { type: Number, default: 0 },
  awayGoals: { type: Number, default: 0 },
  result: { type: String, default: "0-0" },
  isLive: { type: Boolean, default: false },
  status: { type: String, default: "open" }, // open | closed | finished
}, { timestamps: true });

module.exports = mongoose.model("Match", MatchSchema);