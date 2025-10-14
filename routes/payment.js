const express = require("express");
const router = express.Router();
const PaymentMethod = require("../models/PaymentMethod");

// ✅ Get all payment methods
router.get("/all", async (req, res) => {
  try {
    const methods = await PaymentMethod.find().sort({ createdAt: -1 });
    res.json(methods);
  } catch (err) {
    console.error("Error fetching payment methods:", err);
    res.status(500).json({ error: "Failed to fetch payment methods" });
  }
});

// ✅ Create new payment method
router.post("/create", async (req, res) => {
  try {
    const { bankName, accountName, accountNumber } = req.body;
    
    if (!bankName || !accountName || !accountNumber) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if account number already exists
    const existingMethod = await PaymentMethod.findOne({ accountNumber });
    if (existingMethod) {
      return res.status(400).json({ error: "Account number already exists" });
    }

    const newMethod = await PaymentMethod.create({
      bankName,
      accountName,
      accountNumber
    });

    res.status(201).json({ 
      message: "Payment method added successfully ✅", 
      method: newMethod 
    });
  } catch (err) {
    console.error("Error creating payment method:", err);
    res.status(500).json({ error: "Failed to create payment method" });
  }
});

// ✅ Delete payment method
router.delete("/:id", async (req, res) => {
  try {
    const method = await PaymentMethod.findById(req.params.id);
    
    if (!method) {
      return res.status(404).json({ error: "Payment method not found" });
    }

    await PaymentMethod.findByIdAndDelete(req.params.id);
    
    res.json({ message: "Payment method deleted successfully ✅" });
  } catch (err) {
    console.error("Error deleting payment method:", err);
    res.status(500).json({ error: "Failed to delete payment method" });
  }
});

module.exports = router;