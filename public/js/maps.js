// ===============================
// 🗺 Mini Militia Maps — 5 layouts
// All coordinates within MAP_W=2400, MAP_H=1800
// walls: block bullets + players
// bushes: hide player (stealth), don't block bullets
// ===============================

const MINI_MAPS = {
  1: {
    wallColor: "#34495e", wallBorder: "#2c3e50", wallAccent: "#1abc9c", bushColor: "#27ae60", groundTint: "#2b4a66", groundLight: "#7fa9c7", groundPattern: "grass",
    name: "Training Grounds",
    walls: [
      { x: 1050, y: 750, w: 300, h: 300 },
      { x: 200, y: 200, w: 200, h: 200 },
      { x: 2000, y: 200, w: 200, h: 200 },
      { x: 200, y: 1400, w: 200, h: 200 },
      { x: 2000, y: 1400, w: 200, h: 200 },
      { x: 800, y: 400, w: 400, h: 100 },
      { x: 1200, y: 1200, w: 100, h: 400 },
      { x: 500, y: 900, w: 250, h: 250 },
      { x: 1800, y: 600, w: 250, h: 250 }
    ],
    bushes: [
      { x: 600, y: 300, r: 60 },
      { x: 1500, y: 800, r: 80 },
      { x: 300, y: 1400, r: 70 },
      { x: 2000, y: 1200, r: 90 },
      { x: 1000, y: 600, r: 60 },
      { x: 1800, y: 1600, r: 75 }
    ]
  },

  2: {
    wallColor: "#4a4a5a", wallBorder: "#2a2a3a", wallAccent: "#8a8aac", bushColor: "#2d5016", groundTint: "#1a1f2a", groundLight: "#5a6a7a", groundPattern: "road",
    name: "Urban Jungle",
    walls: [
      { x: 300, y: 250, w: 400, h: 250 },
      { x: 900, y: 250, w: 400, h: 250 },
      { x: 1500, y: 250, w: 400, h: 250 },
      { x: 300, y: 700, w: 250, h: 400 },
      { x: 1700, y: 700, w: 250, h: 400 },
      { x: 300, y: 1300, w: 400, h: 250 },
      { x: 900, y: 1300, w: 400, h: 250 },
      { x: 1500, y: 1300, w: 400, h: 250 },
      { x: 900, y: 750, w: 150, h: 150 },
      { x: 1250, y: 750, w: 150, h: 150 },
      { x: 900, y: 1050, w: 150, h: 150 },
      { x: 1250, y: 1050, w: 150, h: 150 }
    ],
    bushes: [
      { x: 750, y: 375, r: 55 },
      { x: 1350, y: 375, r: 55 },
      { x: 1950, y: 375, r: 55 },
      { x: 550, y: 900, r: 65 },
      { x: 1850, y: 900, r: 65 },
      { x: 750, y: 1425, r: 55 },
      { x: 1350, y: 1425, r: 55 },
      { x: 1950, y: 1425, r: 55 }
    ]
  },

  3: {
    wallColor: "#a67c52", wallBorder: "#6b4c2a", wallAccent: "#e0c4a0", bushColor: "#6b8e23", groundTint: "#8a6a44", groundLight: "#e8c890", groundPattern: "sand",
    name: "Desert Fortress",
    walls: [
      { x: 950, y: 700, w: 500, h: 400 },
      { x: 1100, y: 850, w: 200, h: 100 },
      { x: 100, y: 100, w: 300, h: 80 },
      { x: 2000, y: 100, w: 300, h: 80 },
      { x: 100, y: 1620, w: 300, h: 80 },
      { x: 2000, y: 1620, w: 300, h: 80 },
      { x: 100, y: 700, w: 80, h: 300 },
      { x: 2220, y: 700, w: 80, h: 300 },
      { x: 600, y: 500, w: 120, h: 120 },
      { x: 1700, y: 500, w: 120, h: 120 },
      { x: 600, y: 1250, w: 120, h: 120 },
      { x: 1700, y: 1250, w: 120, h: 120 }
    ],
    bushes: [
      { x: 500, y: 900, r: 75 },
      { x: 1900, y: 900, r: 75 },
      { x: 500, y: 1500, r: 65 },
      { x: 1900, y: 1500, r: 65 }
    ]
  },

  4: {
    wallColor: "#c0d4e8", wallBorder: "#7a90b0", wallAccent: "#ffffff", bushColor: "#7a9a8a", groundTint: "#a8c4dc", groundLight: "#e0f0ff", groundPattern: "ice",
    name: "Frozen Wastes",
    walls: [
      { x: 100, y: 400, w: 600, h: 60 },
      { x: 100, y: 400, w: 60, h: 300 },
      { x: 1700, y: 400, w: 600, h: 60 },
      { x: 2240, y: 400, w: 60, h: 300 },
      { x: 100, y: 1400, w: 600, h: 60 },
      { x: 100, y: 1100, w: 60, h: 300 },
      { x: 1700, y: 1400, w: 600, h: 60 },
      { x: 2240, y: 1100, w: 60, h: 300 },
      { x: 800, y: 750, w: 800, h: 60 },
      { x: 800, y: 1000, w: 800, h: 60 }
    ],
    bushes: [
      { x: 400, y: 800, r: 80 },
      { x: 2000, y: 800, r: 80 },
      { x: 400, y: 1000, r: 70 },
      { x: 2000, y: 1000, r: 70 }
    ]
  },

  5: {
    wallColor: "#3a2020", wallBorder: "#1a0a0a", wallAccent: "#ff6a20", bushColor: "#4a3a1a", groundTint: "#1a0808", groundLight: "#6a2010", groundPattern: "lava",
    name: "Volcanic Maze",
    walls: [
      { x: 200, y: 200, w: 200, h: 800 },
      { x: 200, y: 200, w: 800, h: 200 },
      { x: 800, y: 600, w: 800, h: 200 },
      { x: 1400, y: 200, w: 200, h: 800 },
      { x: 1600, y: 800, w: 600, h: 200 },
      { x: 200, y: 1000, w: 800, h: 200 },
      { x: 1000, y: 1200, w: 400, h: 200 },
      { x: 1400, y: 1400, w: 800, h: 200 },
      { x: 200, y: 1400, w: 400, h: 200 }
    ],
    bushes: [
      { x: 500, y: 500, r: 50 },
      { x: 1300, y: 500, r: 50 },
      { x: 500, y: 900, r: 50 },
      { x: 1300, y: 900, r: 50 },
      { x: 500, y: 1300, r: 50 },
      { x: 1300, y: 1300, r: 50 },
      { x: 2100, y: 400, r: 60 },
      { x: 2100, y: 1200, r: 60 }
    ]
  }
};

// Expose globally so both mini-militia.html and mini-lobby.html can read it
window.MINI_MAPS = MINI_MAPS;
