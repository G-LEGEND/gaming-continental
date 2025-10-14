const History = require("../models/History");
const User = require("../models/User");

class HistoryService {
  
  // ✅ Record deposit
  static async recordDeposit(userId, amount, paymentMethod, transactionId, description = null) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");

      return await History.create({
        userId,
        type: "deposit",
        amount: amount,
        description: description || `Deposit via ${paymentMethod}`,
        status: "completed",
        paymentMethod,
        transactionId
      });
    } catch (error) {
      console.error("Record deposit history error:", error);
    }
  }

  // ✅ Record withdrawal request
  static async recordWithdrawal(userId, amount, method, description = null) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");

      return await History.create({
        userId,
        type: "withdraw",
        amount: -amount, // Negative for withdrawal
        description: description || `Withdrawal request via ${method}`,
        status: "pending",
        paymentMethod: method
      });
    } catch (error) {
      console.error("Record withdrawal history error:", error);
    }
  }

  // ✅ Record tournament registration
  static async recordTournamentRegistration(userId, tournamentId, tournamentTitle, amount) {
    try {
      return await History.create({
        userId,
        type: "tournament_registration",
        amount: -amount, // Negative for registration fee
        description: `Registered for tournament: ${tournamentTitle}`,
        status: "completed",
        tournamentId,
        tournamentTitle
      });
    } catch (error) {
      console.error("Record tournament registration history error:", error);
    }
  }

  // ✅ Record tournament win
  static async recordTournamentWin(userId, tournamentId, tournamentTitle, prize, position) {
    try {
      return await History.create({
        userId,
        type: "tournament_win",
        amount: prize,
        description: `Tournament Win: ${tournamentTitle} - ${position} place 🏆`,
        status: "won",
        tournamentId,
        tournamentTitle,
        position
      });
    } catch (error) {
      console.error("Record tournament win history error:", error);
    }
  }

  // ✅ Record tournament loss
  static async recordTournamentLoss(userId, tournamentId, tournamentTitle) {
    try {
      return await History.create({
        userId,
        type: "tournament_lose",
        amount: 0,
        description: `Tournament: ${tournamentTitle}`,
        status: "lost",
        tournamentId,
        tournamentTitle
      });
    } catch (error) {
      console.error("Record tournament loss history error:", error);
    }
  }

  // ✅ Record bet placed
  static async recordBetPlaced(userId, matchId, matchTitle, amount, betType, odds) {
    try {
      return await History.create({
        userId,
        type: "bet_placed",
        amount: -amount, // Negative for bet stake
        description: `Bet placed: ${matchTitle} (${betType})`,
        status: "pending",
        matchId,
        matchTitle,
        betType,
        odds
      });
    } catch (error) {
      console.error("Record bet placed history error:", error);
    }
  }

  // ✅ Record bet win
  static async recordBetWin(userId, matchId, matchTitle, stake, winnings, betType) {
    try {
      return await History.create({
        userId,
        type: "bet_win",
        amount: winnings, // Total winnings (stake + profit)
        description: `Bet Won: ${matchTitle} (${betType}) ✅`,
        status: "won",
        matchId,
        matchTitle,
        betType
      });
    } catch (error) {
      console.error("Record bet win history error:", error);
    }
  }

  // ✅ Record bet loss
  static async recordBetLoss(userId, matchId, matchTitle, betType) {
    try {
      return await History.create({
        userId,
        type: "bet_lose",
        amount: 0,
        description: `Bet Lost: ${matchTitle} (${betType}) ❌`,
        status: "lost",
        matchId,
        matchTitle,
        betType
      });
    } catch (error) {
      console.error("Record bet loss history error:", error);
    }
  }

  // ✅ Record bonus
  static async recordBonus(userId, amount, description) {
    try {
      return await History.create({
        userId,
        type: "bonus",
        amount: amount,
        description: description,
        status: "completed"
      });
    } catch (error) {
      console.error("Record bonus history error:", error);
    }
  }
}

module.exports = HistoryService;