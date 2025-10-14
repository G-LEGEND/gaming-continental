const mongoose = require("mongoose");

const RegistrationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament", required: true },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Registration", RegistrationSchema);