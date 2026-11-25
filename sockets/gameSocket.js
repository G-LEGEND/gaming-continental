// ============================================================
// 🎮 Socket.IO real-time game server for Mini Militia PvP
// ============================================================
// Rooms are keyed by roomCode. Each room has:
//   - players: Map<socketId, { userId, username, team, x, y, angle, health, kills, alive, lastSeen }>
//   - lastBroadcast: timestamp
//
// Message protocol (client → server):
//   'join-room'     { roomCode, userId, username, team }
//   'position'      { x, y, angle, health, alive }
//   'shoot'         { targetSocketId?, bullet: { x, y, vx, vy, dmg, weapon } }
//   'respawn'       {}
//   'leave-room'    {}
//
// Message protocol (server → client):
//   'room-state'      { players: [...], endsAt, timeLimit }
//   'player-joined'   { socketId, userId, username, team, x, y, health, kills, alive }
//   'player-left'     { socketId }
//   'player-moved'    { socketId, x, y, angle, health, alive }
//   'bullet-from-remote' { socketId, username, bulletId, bullet }
//   'player-hit'      { killerSocketId, killerUsername, killerKills, respawnInMs }   (victim only)
//   'player-died'     { victimSocketId, victimUsername, killerSocketId, killerUsername, killerKills } (others)
//   'you-respawned'   { socketId, x, y, health, kills }   (victim only)
//   'player-respawned'{ socketId, username, x, y, health, kills }   (others)
//   'game-ended'      { reason }
// ============================================================

const MiniRoom = require("../models/MiniRoom");

// In-memory room state
const rooms = new Map();
// roomCode -> {
//   players: Map<socketId, playerState>,
//   startedAt: Date,
//   endsAt: Date,
//   timeLimit: number,
//   mode: 'pvp' | 'solo_vs_bot',
//   teamSize: number,
//   gameEndTimer: NodeJS.Timeout | null
// }

function getOrCreateRoom(roomCode, roomDoc) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      players: new Map(),
      startedAt: roomDoc.startedAt,
      endsAt: roomDoc.endsAt,
      timeLimit: roomDoc.timeLimit,
      mode: roomDoc.mode,
      teamSize: roomDoc.teamSize,
      gameEndTimer: null
    });
  }
  return rooms.get(roomCode);
}

function broadcastToRoom(io, roomCode, event, data, exceptSocketId = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const [sid] of room.players) {
    if (sid === exceptSocketId) continue;
    io.to(sid).emit(event, data);
  }
}

function serializeRoom(room) {
  const players = [];
  for (const [sid, p] of room.players) {
    players.push({
      socketId: sid,
      userId: p.userId,
      username: p.username,
      team: p.team,
      x: p.x, y: p.y, angle: p.angle,
      health: p.health, kills: p.kills, alive: p.alive
    });
  }
  return {
    players,
    endsAt: room.endsAt,
    startedAt: room.startedAt,
    timeLimit: room.timeLimit,
    mode: room.mode,
    teamSize: room.teamSize
  };
}

function attachGameSocket(io) {
  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`);
    let currentRoomCode = null;

    // ---------- JOIN ROOM ----------
    socket.on("join-room", async ({ roomCode, userId, username, team }, ack) => {
      try {
        if (!roomCode || !username) {
          return ack && ack({ ok: false, error: "Missing roomCode/username" });
        }

        // Fetch room from DB (sanity check)
        const roomDoc = await MiniRoom.findOne({ roomCode });
        if (!roomDoc) return ack && ack({ ok: false, error: "Room not found" });
        if (roomDoc.mode === "solo_vs_bot") {
          return ack && ack({ ok: false, error: "Solo mode does not use sockets" });
        }

        const room = getOrCreateRoom(roomCode, roomDoc);
        currentRoomCode = roomCode;
        socket.join(roomCode);

        // ✅ Spawn each player at a different corner so they don't overlap
        const spawnCorners = [
          { x: 300, y: 300 }, { x: 2100, y: 300 },
          { x: 300, y: 1500 }, { x: 2100, y: 1500 },
          { x: 1200, y: 300 }, { x: 1200, y: 1500 }
        ];
        const spawn = spawnCorners[room.players.size % spawnCorners.length];

        const existing = room.players.get(socket.id);
        const playerState = existing || {
          userId: userId || null,
          username,
          team: team || 1,
          x: spawn.x, y: spawn.y, angle: 0,
          health: 100,
          kills: 0,
          alive: true,
          lastSeen: Date.now()
        };
        playerState.username = username;
        playerState.team = team || playerState.team;
        playerState.lastSeen = Date.now();
        room.players.set(socket.id, playerState);

        console.log(`[socket] ${username} (${socket.id}) joined ${roomCode}. Total: ${room.players.size}`);

        // Send current room state to the joiner
        socket.emit("room-state", serializeRoom(room));

        // Notify others
        broadcastToRoom(io, roomCode, "player-joined", {
          socketId: socket.id,
          userId: playerState.userId,
          username: playerState.username,
          team: playerState.team,
          x: playerState.x,
          y: playerState.y,
          health: playerState.health,
          kills: playerState.kills,
          alive: playerState.alive
        }, socket.id);

        // Auto-end timer if endsAt is in future
        if (room.endsAt && !room.gameEndTimer) {
          const ms = new Date(room.endsAt).getTime() - Date.now();
          if (ms > 0) {
            room.gameEndTimer = setTimeout(() => {
              console.log(`[socket] Room ${roomCode} timer expired`);
              io.to(roomCode).emit("game-ended", { reason: "time_up" });
            }, ms);
          }
        }

        ack && ack({ ok: true, state: serializeRoom(room) });
      } catch (err) {
        console.error("[socket] join-room error:", err);
        ack && ack({ ok: false, error: err.message });
      }
    });

    // ---------- POSITION UPDATE ----------
    socket.on("position", (data) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const p = room.players.get(socket.id);
      if (!p) return;

      p.x = data.x;
      p.y = data.y;
      p.angle = data.angle;
      // ✅ Server-authoritative alive: only respawn() can flip alive=true again.
      if (p.alive) p.health = data.health;
      p.lastSeen = Date.now();

      // Broadcast to others (not back to sender)
      broadcastToRoom(io, currentRoomCode, "player-moved", {
        socketId: socket.id,
        x: p.x, y: p.y, angle: p.angle,
        health: p.health, alive: p.alive
      }, socket.id);
    });

    // ---------- SHOOT (relay bullet visual only; hit-detection on victim) ----------
    socket.on("shoot", (data) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const p = room.players.get(socket.id);
      if (!p || !p.alive) return;

      broadcastToRoom(io, currentRoomCode, "bullet-from-remote", {
        socketId: socket.id,
        username: p.username,
        bulletId: data.bulletId,
        bullet: data.bullet
      }, socket.id);
    });

    // ---------- SHOOT-HIT (attacker claims a hit) ----------
    // Per-bullet dedup + HP accumulation. A kill only fires when HP reaches 0.
    socket.on("shoot-hit", ({ targetSocketId, bulletId, bullet }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const killer = room.players.get(socket.id);
      const victim = room.players.get(targetSocketId);
      if (!killer || !victim) return;
      if (!killer.alive) return;
      if (!victim.alive) return;

      // Deduplicate: each bulletId can only register ONCE per target
      if (bulletId) {
        if (!victim._hitBullets) victim._hitBullets = new Set();
        if (victim._hitBullets.has(bulletId)) return;
        victim._hitBullets.add(bulletId);
        // Cap the set size so it doesn't grow forever
        if (victim._hitBullets.size > 500) {
          const first = victim._hitBullets.values().next().value;
          victim._hitBullets.delete(first);
        }
      }

      // Distance check (anti-cheat)
      const dist = Math.hypot((killer.x || 0) - (victim.x || 0), (killer.y || 0) - (victim.y || 0));
      const MAX_HIT_RANGE = 2000;
      if (dist > MAX_HIT_RANGE) {
        console.log(`[socket] Rejected hit: ${killer.username}→${victim.username} at dist ${dist.toFixed(0)}`);
        return;
      }

      // Apply DAMAGE (not instant kill)
      const dmg = Number(bullet?.dmg) || 10;
      victim.health = Math.max(0, (victim.health ?? 100) - dmg);

      // Tell victim their new HP (for HUD + shake)
      io.to(targetSocketId).emit("took-damage", {
        newHealth: victim.health,
        bySocketId: socket.id,
        byUsername: killer.username
      });

      // Only register a kill when HP hits 0
      if (victim.health > 0) return;

      killer.kills = (killer.kills || 0) + 1;
      victim.alive = false;

      console.log(`[socket] KILL: ${killer.username} killed ${victim.username} (${killer.kills} kills)`);

      io.to(targetSocketId).emit("player-hit", {
        killerSocketId: socket.id,
        killerUsername: killer.username,
        killerKills: killer.kills,
        respawnInMs: 3000
      });

      broadcastToRoom(io, currentRoomCode, "player-died", {
        victimSocketId: targetSocketId,
        victimUsername: victim.username,
        killerSocketId: socket.id,
        killerUsername: killer.username,
        killerKills: killer.kills
      });

      MiniRoom.findOne({ roomCode: currentRoomCode }).then((doc) => {
        if (!doc) return;
        const dbKiller = doc.players.find(pl => pl.username === killer.username);
        if (dbKiller) dbKiller.kills = killer.kills;
        const dbVictim = doc.players.find(pl => pl.username === victim.username);
        if (dbVictim) dbVictim.isAlive = false;
        doc.save().catch(() => {});
      }).catch(() => {});
    });

    // ---------- HIT REPORT (victim confirms) ----------
    socket.on("hit-reported", ({ killerSocketId, killerKills, bullet }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const victim = room.players.get(socket.id);
      const killer = room.players.get(killerSocketId);
      if (!victim || !killer) return;
      if (!killer.alive) return;

      killer.kills = (killer.kills || 0) + 1;
      victim.alive = false;
      victim.health = 0;

      console.log(`[socket] ${killer.username} killed ${victim.username}. Kills: ${killer.kills}`);

      io.to(socket.id).emit("player-hit", {
        killerSocketId,
        killerUsername: killer.username,
        killerKills: killer.kills,
        respawnInMs: 3000
      });

      broadcastToRoom(io, currentRoomCode, "player-died", {
        victimSocketId: socket.id,
        victimUsername: victim.username,
        killerSocketId,
        killerUsername: killer.username,
        killerKills: killer.kills
      }, socket.id);

      MiniRoom.findOne({ roomCode: currentRoomCode }).then((doc) => {
        if (!doc) return;
        const dbKiller = doc.players.find(pl => pl.username === killer.username);
        if (dbKiller) dbKiller.kills = killer.kills;
        doc.save().catch(() => {});
      }).catch(() => {});
    });

    // ---------- RESPAWN ----------
    // ✅ FIXED: only the dead player gets 'you-respawned'.
    //    Everyone else gets 'player-respawned' to update just that sprite.
    socket.on("respawn", () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const p = room.players.get(socket.id);
      if (!p) return;

      // Random spawn at one of the map corners/edges
      const corners = [
        { x: 200, y: 200 },
        { x: 2200, y: 200 },
        { x: 200, y: 1600 },
        { x: 2200, y: 1600 },
        { x: 1200, y: 200 },
        { x: 1200, y: 1600 }
      ];
      const spawn = corners[Math.floor(Math.random() * corners.length)];

      p.x = spawn.x;
      p.y = spawn.y;
      p.health = 100;
      p.alive = true;
      if (p._hitBullets) p._hitBullets.clear();  // fresh HP pool each life

      // 1) Victim-only authoritative respawn
      io.to(socket.id).emit("you-respawned", {
        socketId: socket.id,
        x: p.x, y: p.y,
        health: p.health,
        kills: p.kills
      });

      // 2) Everyone else just moves that player's sprite
      broadcastToRoom(io, currentRoomCode, "player-respawned", {
        socketId: socket.id,
        username: p.username,
        x: p.x, y: p.y,
        health: p.health,
        kills: p.kills
      }, socket.id);
    });

    // ---------- LEAVE ----------
    socket.on("leave-room", () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (room) {
        const p = room.players.get(socket.id);
        if (p) {
          broadcastToRoom(io, currentRoomCode, "player-left", {
            socketId: socket.id,
            username: p.username
          });
        }
        room.players.delete(socket.id);
      }
      socket.leave(currentRoomCode);
      currentRoomCode = null;
    });

    // ---------- DISCONNECT ----------
    socket.on("disconnect", () => {
      console.log(`[socket] disconnected: ${socket.id}`);
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const p = room.players.get(socket.id);
      if (p) {
        broadcastToRoom(io, currentRoomCode, "player-left", {
          socketId: socket.id,
          username: p.username
        });
      }
      room.players.delete(socket.id);

      if (room.players.size === 0) {
        if (room.gameEndTimer) clearTimeout(room.gameEndTimer);
        rooms.delete(currentRoomCode);
        console.log(`[socket] room ${currentRoomCode} cleaned up`);
      }
    });
  });

  console.log("[socket] Socket.IO game server attached");
}

module.exports = { attachGameSocket, rooms };
