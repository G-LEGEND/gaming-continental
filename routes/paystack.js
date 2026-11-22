const express = require("express");
const router = express.Router();
const User = require("../models/User");
const History = require("../models/History");
const Deposit = require("../models/Deposit");
const Withdraw = require("../models/Withdrawal");

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Helper to call Paystack API
async function paystackRequest(path, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`https://api.paystack.co${path}`, opts);
  const data = await res.json();
  return { ok: res.ok, data };
}

// ✅ Serve the bank list to the frontend (FIXED)
router.get("/banks", async (req, res) => {
  try {
    // Using /bank with no params returns all supported banks
    const { ok, data } = await paystackRequest("/bank");
    
    if (!ok || !data.status) {
      console.error("Paystack bank fetch failed:", data);
      return res.status(400).json({ error: "Failed to load banks from Paystack" });
    }

    // Filter for Nigeria only just in case
    const ngBanks = data.data.filter(bank => bank.currency === "NGN" || bank.country === "Nigeria");
    
    return res.json(ngBanks);
  } catch (err) {
    console.error("Bank fetch error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---------- DEPOSIT VERIFICATION ----------
router.post("/verify", async (req, res) => {
  try {
    const { reference, userId } = req.body;
    if (!reference || !userId) return res.status(400).json({ error: "Reference and userId required" });

    const existing = await History.findOne({ type: "deposit", transactionId: `paystack_${reference}` });
    if (existing) return res.status(400).json({ error: "This payment was already credited" });

    const { ok, data } = await paystackRequest(`/transaction/verify/${reference}`);
    if (!ok || !data.status) return res.status(400).json({ error: "Verification failed" });

    const tx = data.data;
    if (tx.status !== "success") return res.status(400).json({ error: `Payment not successful: ${tx.status}` });

    const amountNaira = tx.amount / 100;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.balance = Number(user.balance) + amountNaira;
    await user.save();

    await History.create({
      userId, type: "deposit", amount: amountNaira,
      description: `Paystack deposit (${tx.channel})`,
      status: "completed", transactionId: `paystack_${reference}`, createdAt: new Date(),
    });

    await Deposit.create({ userId, amount: amountNaira, status: "approved", reference: tx.reference });

    return res.json({ message: "Payment verified and credited", amount: amountNaira, newBalance: user.balance });
  } catch (err) {
    console.error("Paystack verify error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ---------- WITHDRAWAL (Send Money to Bank) ----------
router.post("/withdraw", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || !amount) return res.status(400).json({ error: "userId and amount required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (Number(user.balance) < Number(amount)) return res.status(400).json({ error: "Insufficient balance" });
    if (amount < 1000) return res.status(400).json({ error: "Minimum withdrawal is ₦1000" });

    let accountNumber, bankName, accountName;
    
    if (user.bankDetails?.accountNumber) {
      accountNumber = user.bankDetails.accountNumber;
      bankName = user.bankDetails.bankName;
      accountName = user.bankDetails.accountName;
    } else if (user.accountNumber) {
      accountNumber = user.accountNumber;
      bankName = user.bankName;
      accountName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }

    if (!accountNumber || !bankName) {
      return res.status(400).json({ error: "No bank details found." });
    }

    // 1. Get bank code
    const banksRes = await paystackRequest("/bank");
    if (!banksRes.ok || !banksRes.data.data) {
      return res.status(500).json({ error: "Could not fetch bank list from Paystack" });
    }

    const bankList = banksRes.data.data;
    const matchedBank = bankList.find(b => b.name.toLowerCase() === bankName.toLowerCase());

    if (!matchedBank) {
      return res.status(400).json({ error: `Bank "${bankName}" not recognized by Paystack.` });
    }

    // 2. Create transfer recipient
    const recipientRes = await paystackRequest("/transferrecipient", "POST", {
      type: "nuban",
      name: accountName || "User",
      account_number: accountNumber,
      bank_code: matchedBank.code,
      currency: "NGN",
    });

    if (!recipientRes.ok) {
      return res.status(400).json({ error: "Could not create transfer recipient", details: recipientRes.data });
    }

    const recipientCode = recipientRes.data.data.recipient_code;

    // 3. Initiate transfer
    const transferRes = await paystackRequest("/transfer", "POST", {
      source: "balance",
      amount: Math.round(amount * 100),
      recipient: recipientCode,
      reason: "Withdrawal from Gaming Continental",
    });

    if (!transferRes.ok) {
      return res.status(400).json({ error: "Transfer failed", details: transferRes.data });
    }

    const transfer = transferRes.data.data;

    // 4. Deduct balance
    user.balance = Number(user.balance) - Number(amount);
    await user.save();

    // 5. Log
    const withdraw = await Withdraw.create({
      userId, username: user.nickname, amount,
      method: "Paystack Transfer",
      accountDetails: { accountNumber, bankName, accountName },
      status: "approved",
      reference: transfer.reference,
    });

    await History.create({
      userId, type: "withdraw", amount,
      description: `Paystack transfer to ${bankName} - ${accountNumber}`,
      status: "completed",
      transactionId: withdraw._id.toString(),
      createdAt: new Date(),
    });

    return res.json({
      message: "Withdrawal successful! Money sent to your bank.",
      reference: transfer.reference,
      amount: amount,
      newBalance: user.balance,
    });

  } catch (err) {
    console.error("Paystack withdraw error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
