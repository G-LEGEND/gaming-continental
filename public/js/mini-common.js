// ============================================================
// 🎮 MINI MILITIA — Shared code for Solo & PvP modes
// Pure helpers only. No game state, no mode-specific logic.
// ============================================================

window.MiniCommon = (function() {
    // ============ WEAPON STATS (shared) ============
    const WEAPONS = {
        pistol:  { name: 'PISTOL', cooldown: 15, speed: 12, dmg: 15, spread: 0, count: 1, color: '#ebcb8b', size: 6, range: 500, shake: 2, maxAmmo: 10 },
        smg:     { name: 'SMG', cooldown: 5, speed: 14, dmg: 8, spread: 0.15, count: 1, color: '#5e81ac', size: 5, range: 450, shake: 1.5, maxAmmo: 25 },
        shotgun: { name: 'SHOTGUN', cooldown: 35, speed: 11, dmg: 12, spread: 0.5, count: 5, color: '#b48ead', size: 5, range: 300, shake: 6, maxAmmo: 5 },
        sniper:  { name: 'SNIPER', cooldown: 60, speed: 25, dmg: 60, spread: 0, count: 1, color: '#d08770', size: 4, range: 2000, shake: 8, maxAmmo: 3 },
        rifle:   { name: 'RIFLE', cooldown: 10, speed: 15, dmg: 18, spread: 0.05, count: 1, color: '#bf616a', size: 6, range: 800, shake: 4, maxAmmo: 20 }
    };

    // ============ BOT WEAPON STATS ============
    const BOT_WEAPON_STATS = {
        pistol:  { cooldown: 80, speed: 8,  dmg: 8,  spread: 0.08, count: 1, size: 5, range: 700 },
        smg:     { cooldown: 25, speed: 10, dmg: 5,  spread: 0.20, count: 1, size: 4, range: 550 },
        rifle:   { cooldown: 45, speed: 11, dmg: 10, spread: 0.10, count: 1, size: 5, range: 800 },
        shotgun: { cooldown: 90, speed: 9,  dmg: 6,  spread: 0.60, count: 4, size: 4, range: 350 },
        sniper:  { cooldown: 140, speed: 18, dmg: 30, spread: 0,  count: 1, size: 5, range: 1400 }
    };

    // ============ WALL COLLISION (circle vs rect) ============
    function rectCollide(x, y, r, rect) {
        const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
        const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
        const dx = x - cx, dy = y - cy;
        return (dx * dx + dy * dy) < (r * r);
    }

    function resolveWallCollisions(ent, walls) {
        for (let wall of walls) {
            if (rectCollide(ent.x, ent.y, ent.radius, wall)) {
                const cx = Math.max(wall.x, Math.min(ent.x, wall.x + wall.w));
                const cy = Math.max(wall.y, Math.min(ent.y, wall.y + wall.h));
                const dx = ent.x - cx, dy = ent.y - cy;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    const push = ent.radius - dist;
                    ent.x += (dx / dist) * push;
                    ent.y += (dy / dist) * push;
                } else {
                    ent.x += (ent.vx || 0) * -1.5;
                    ent.y += (ent.vy || 0) * -1.5;
                }
            }
        }
    }

    // ============ DISTANCE HELPER ============
    function dist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    // ============ DRAW A STICKMAN ============
    // color = 'player' | 'bot' (blue or red base color)
    // weaponType = 'pistol' | 'smg' | ...
    // extra = { label, kills, isReloading, ammo, maxAmmo } (optional overlay)
    function drawStickman(ctx, x, y, angle, opts = {}) {
        const {
            isPlayer = false,
            weaponType = 'pistol',
            playerInBush = false,
            playerColor = '#3a9bdc',
            inBush = false
        } = opts;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        if (isPlayer && playerInBush) ctx.globalAlpha = 0.4;
        else if (!isPlayer && inBush) ctx.globalAlpha = 0.7;

        // Leg
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(-18, -8, 8, 16);

        if (isPlayer) {
            ctx.fillStyle = '#e67e22';
            ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(-22, 18); ctx.lineTo(-14, 8); ctx.fill();
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath(); ctx.moveTo(-17, 8); ctx.lineTo(-18, 14); ctx.lineTo(-15, 8); ctx.fill();
        }

        // Body
        ctx.fillStyle = isPlayer ? playerColor : '#c0392b';
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();

        // Armor
        ctx.fillStyle = isPlayer ? '#2ecc71' : '#f39c12';
        ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(10, -15); ctx.lineTo(15, -5); ctx.lineTo(0, 0); ctx.fill();

        // Helmet
        ctx.fillStyle = isPlayer ? '#ecf0f1' : '#bdc3c7';
        ctx.beginPath(); ctx.arc(5, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath(); ctx.arc(8, -2, 5, -Math.PI / 2, Math.PI / 2); ctx.fill();

        // Gun
        let gunColor = '#ebcb8b';
        if (weaponType === 'sniper') gunColor = '#d08770';
        else if (weaponType === 'shotgun') gunColor = '#b48ead';
        else if (weaponType === 'smg') gunColor = '#5e81ac';
        else if (weaponType === 'rifle') gunColor = '#bf616a';

        ctx.fillStyle = '#34495e';
        if (weaponType === 'sniper') { ctx.fillRect(10, 2, 30, 4); ctx.fillStyle = gunColor; ctx.fillRect(15, -2, 10, 4); }
        else if (weaponType === 'shotgun') { ctx.fillRect(10, 1, 22, 6); ctx.fillStyle = gunColor; ctx.fillRect(15, 1, 10, 6); }
        else if (weaponType === 'smg' || weaponType === 'rifle') { ctx.fillRect(10, 2, 15, 8); ctx.fillStyle = gunColor; ctx.fillRect(15, 2, 5, 8); }
        else { ctx.fillRect(10, 4, 10, 4); ctx.fillStyle = gunColor; ctx.fillRect(12, 4, 4, 4); }

        ctx.restore();
    }

    // ============ SOUND MANAGER ============
    class SoundManager {
        constructor() {
            this.sounds = {
                pistol: new Audio("/sounds/shoot_pistol.mp3"),
                smg: new Audio("/sounds/shoot_smg.mp3"),
                shotgun: new Audio("/sounds/shoot_shotgun.mp3"),
                sniper: new Audio("/sounds/shoot_sniper.mp3"),
                rifle: new Audio("/sounds/shoot_rifle.mp3"),
                pickup: new Audio("/sounds/pickup.mp3"),
                empty: new Audio("/sounds/empty.mp3"),
                hurt: new Audio("/sounds/hurt.mp3")
            };
            this.unlocked = false;
        }
        play(name, volume = 0.5) {
            const s = this.sounds[name];
            if (s) {
                s.volume = volume;
                s.currentTime = 0;
                s.play().catch(() => {});
            }
        }
        unlockOnFirstTouch() {
            document.body.addEventListener("touchstart", function unlock() {
                Object.values(this.sounds).forEach(s => {
                    s.play().then(() => { s.pause(); s.currentTime = 0; }).catch(() => {});
                });
                this.unlocked = true;
                document.body.removeEventListener("touchstart", unlock);
            }.bind(this), { once: true });
        }
    }

    // ============ JOYSTICK ============
    function setupJoystick(baseEl, knobEl, onStart, onMove, onEnd) {
        let isActive = false, center = { x: 0, y: 0 }, maxDist = 40;
        let activeTouchId = null;

        function updateCenter() {
            const rect = baseEl.getBoundingClientRect();
            center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            maxDist = rect.width * 0.35;
        }

        function handleMove(clientX, clientY) {
            let dx = clientX - center.x, dy = clientY - center.y;
            let visualDx = dy, visualDy = -dx;
            const d = Math.hypot(visualDx, visualDy);
            if (d > maxDist) {
                visualDx = (visualDx / d) * maxDist;
                visualDy = (visualDy / d) * maxDist;
            }
            knobEl.style.transform = `translate(calc(-50% + ${visualDx}px), calc(-50% + ${visualDy}px))`;
            onMove(visualDx / maxDist, visualDy / maxDist);
        }

        baseEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (activeTouchId !== null) return;
            const touch = e.changedTouches[0];
            activeTouchId = touch.identifier;
            isActive = true;
            updateCenter();
            onStart();
            handleMove(touch.clientX, touch.clientY);
        }, { passive: false });

        baseEl.addEventListener('touchmove', (e) => {
            if (!isActive || activeTouchId === null) return;
            for (const touch of e.changedTouches) {
                if (touch.identifier === activeTouchId) {
                    handleMove(touch.clientX, touch.clientY);
                    e.preventDefault();
                    break;
                }
            }
        }, { passive: false });

        baseEl.addEventListener('touchend', (e) => {
            if (!isActive || activeTouchId === null) return;
            for (const touch of e.changedTouches) {
                if (touch.identifier === activeTouchId) {
                    isActive = false;
                    activeTouchId = null;
                    knobEl.style.transform = `translate(-50%, -50%)`;
                    onEnd();
                    break;
                }
            }
        });

        baseEl.addEventListener('touchcancel', () => {
            if (activeTouchId !== null) {
                isActive = false;
                activeTouchId = null;
                knobEl.style.transform = `translate(-50%, -50%)`;
                onEnd();
            }
        });

        baseEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isActive = true;
            updateCenter();
            onStart();
            handleMove(e.clientX, e.clientY);
        });

        window.addEventListener('mousemove', (e) => {
            if (isActive) handleMove(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', () => {
            if (isActive) {
                isActive = false;
                knobEl.style.transform = `translate(-50%, -50%)`;
                onEnd();
            }
        });
    }

    // ============ CAMERA ZOOM HELPER ============
    function computeCameraZoom(canvasW, canvasH, weapon, zoomLevel) {
        if (weapon === 'sniper' && zoomLevel > 1) {
            let z = 0.2 - (zoomLevel * 0.03);
            return z < 0.05 ? 0.05 : z;
        }
        return Math.max(0.4, Math.min(canvasW / 900, canvasH / 600));
    }

    // ============ PUBLIC API ============
    return {
        WEAPONS,
        BOT_WEAPON_STATS,
        rectCollide,
        resolveWallCollisions,
        dist,
        drawStickman,
        SoundManager,
        setupJoystick,
        computeCameraZoom
    };
})();
