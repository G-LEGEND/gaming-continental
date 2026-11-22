// You can easily add new weapons here!
module.exports = {
    pistol:  { name: 'PISTOL', cooldown: 15, speed: 12, dmg: 15, spread: 0, count: 1, color: '#ebcb8b', size: 6, range: 500, shake: 2, maxAmmo: 10 },
    smg:     { name: 'SMG', cooldown: 5, speed: 14, dmg: 8, spread: 0.15, count: 1, color: '#5e81ac', size: 5, range: 450, shake: 1.5, maxAmmo: 25 },
    shotgun: { name: 'SHOTGUN', cooldown: 35, speed: 11, dmg: 12, spread: 0.5, count: 5, color: '#b48ead', size: 5, range: 300, shake: 6, maxAmmo: 5 },
    sniper:  { name: 'SNIPER', cooldown: 60, speed: 25, dmg: 60, spread: 0, count: 1, color: '#d08770', size: 4, range: 2000, shake: 8, maxAmmo: 3 },
    rifle:   { name: 'RIFLE', cooldown: 10, speed: 15, dmg: 18, spread: 0.05, count: 1, color: '#bf616a', size: 6, range: 800, shake: 4, maxAmmo: 20 }
};
