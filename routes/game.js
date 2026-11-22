const express = require("express");
const router = express.Router();
const Game = require("../models/Game");
const User = require("../models/User");

// ✅ MASSIVE Word pools for true randomness
const WORDS = {
  3: ["cat","dog","sun","run","fly","box","key","map","net","top","red","ice","arm","bat","cup","egg","fan","gap","hat","ink","jar","kid","leg","man","nap","oak","pen","rat","sky","toy","van","web","yak","zip","ash","bug","cod","den","ear","fox","gum","hut","ivy","joy","log","mud","new","owl","pig","ray","saw","tip","urn","vet","wax","yak","zoo","bee","cow","duck","fig","gal","ham","jet","kit","lip","mix","nod","oar","pup","rag","sit","tan","up","vow","win","yes","zap"],
  5: ["apple","brave","crane","drive","eagle","flame","grape","house","image","joker","knife","lemon","magic","noble","ocean","pilot","queen","river","stone","tiger","ultra","vivid","wheat","xenon","yacht","zebra","charm","doubt","entry","frost","globe","hazel","input","jelly","kneel","loyal","mango","nurse","orbit","piano","quilt","roast","scale","trend","unify","vocal","whale","yield","zesty","amber","blink","crisp","dwell","elbow","fable","giant","hinge","ivory","jumbo","kitty","latch","mimic","novel","opera","prawn","quack","robin","scrub","thick","uncle","valve","witty","yodel","zippy","adobe","bingo","comet"],
  6: ["planet","rocket","wizard","silver","golden","forest","garden","bright","castle","dragon","effort","fabric","gadget","harbor","island","jungle","kitten","legend","magnet","napkin","office","purple","quartz","rabbit","saddle","tangle","united","valley","wander","yellow","zipper","bridge","camera","danger","engine","flight","gentle","honest","insect","jumper","kettle","ladder","marble","nature","object","pencil","quartz","ribbon","signal","tunnel","unique","vacuum","winter","yogurt","zombie","anchor","ballot","cactus","dazzle","effect"]
};

// Helper to generate 20 unique words
function generateWords(length) {
  const pool = [...WORDS[length]];
  const selected = [];
  
  // Shuffle pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  
  // Pick 20 unique words
  for (let i = 0; i < 20; i++) {
    selected.push(pool[i % pool.length]);
  }
  return selected;
}

// 1. Start Game
router.post("/start", async (req, res) => {
  try {
    const { userId, stake, odds, wordLength } = req.body;
    
    if (!userId || !stake || !odds) return res.status(400).json({ error: "Missing data" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.balance < stake) return res.status(400).json({ error: "Insufficient balance" });

    // Deduct stake immediately
    user.balance = Number(user.balance) - Number(stake);
    await user.save();

    const words = generateWords(wordLength || 3);

    const game = await Game.create({
      userId, words, stake, odds, status: "active", currentIndex: 0
    });

    res.json({
      message: "Game started",
      gameId: game._id,
      firstWord: game.words[0],
      balance: user.balance
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Get Next Word
router.post("/next-word", async (req, res) => {
  try {
    const { gameId } = req.body;
    const game = await Game.findById(gameId);
    
    if (!game || game.status !== "active") {
      return res.status(400).json({ error: "Invalid or ended game" });
    }

    game.currentIndex++;
    
    if (game.currentIndex >= 20) {
      await game.save();
      return res.json({ finished: true });
    }

    await game.save();
    res.json({ nextWord: game.words[game.currentIndex], index: game.currentIndex });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// 3. End Game (Win or Lose)
router.post("/end", async (req, res) => {
  try {
    const { gameId, won } = req.body;
    const game = await Game.findById(gameId).populate("userId");
    
    if (!game || game.status !== "active") {
      return res.status(400).json({ error: "Game already ended" });
    }

    if (won) {
      game.status = "won";
      const payout = Number(game.stake) * Number(game.odds);
      game.userId.balance = Number(game.userId.balance) + payout;
      await game.userId.save();
      await game.save();
      res.json({ message: "You won!", newBalance: game.userId.balance });
    } else {
      game.status = "lost";
      await game.save();
      res.json({ message: "You lost.", newBalance: game.userId.balance });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
