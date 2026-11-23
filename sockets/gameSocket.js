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
//   'room-state'    { players: [...], endsAt, timeLimit }
//   'player-joined' { socketId, userId, username, team }
//   'player-left'   { socketId }
//   'player-moved'  { socketId, x, y, angle, health, alive }
//   'player-shot'   { socketId, bullet }
//   'player-hit'    { victimSocketId, killerSocketId, killerKills, respawnInMs }
//   'player-respawned' { socketId, x, y, health, kills }
//   'game-ended'    { reason, results }
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

        // Add or update player
        const existing = room.players.get(socket.id);
        const playerState = existing || {
          userId: userId || null,
          username,
          team: team || 1,
          x: 1200, y: 900, angle: 0,       // default spawn
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
          team: playerState.team
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
      p.health = data.health;
      p.alive = data.alive;
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
        bullet: data.bullet
      }, socket.id);
    });

    // ---------- SHOOT-HIT (attacker claims a hit) ----------
    // Attacker says: "my bullet hit targetSocketId"
    // Server validates distance, then applies kill.
    socket.on("shoot-hit", ({ targetSocketId, bullet }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const killer = room.players.get(socket.id);
      const victim = room.players.get(targetSocketId);
      if (!killer || !victim) return;
      if (!killer.alive) return;
      if (!victim.alive) return;  // already dead

      // Basic distance check — reject if too far (anti-cheat)
      const dist = Math.hypot((killer.x || 0) - (victim.x || 0), (killer.y || 0) - (victim.y || 0));
      const MAX_HIT_RANGE = 2000;  // generous — bullets travel far
      if (dist > MAX_HIT_RANGE) {
        console.log(`[socket] Rejected hit: ${killer.username}→${victim.username} at dist ${dist.toFixed(0)}`);
        return;
      }

      // Apply kill
      killer.kills = (killer.kills || 0) + 1;
      victim.alive = false;
      victim.health = 0;

      console.log(`[socket] KILL: ${killer.username} killed ${victim.username} (${killer.kills} kills)`);

      // Notify victim — 3s respawn countdown + killer's kills
      io.to(targetSocketId).emit("player-hit", {
        killerSocketId: socket.id,
        killerUsername: killer.username,
        killerKills: killer.kills,
        respawnInMs: 3000
      });

      // Notify everyone else — update scoreboard
      broadcastToRoom(io, currentRoomCode, "player-died", {
        victimSocketId: targetSocketId,
        victimUsername: victim.username,
        killerSocketId: socket.id,
        killerUsername: killer.username,
        killerKills: killer.kills
      });

      // Update DB kills (async)
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
    // A client can only report a hit ON ITSELF, from another player.
    // This makes "I hit you" claims server-validated by the victim.
    socket.on("hit-reported", ({ killerSocketId, killerKills, bullet }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const victim = room.players.get(socket.id);
      const killer = room.players.get(killerSocketId);
      if (!victim || !killer) return;
      if (!killer.alive) return;

      // Increment killer's kills (server-authoritative)
      killer.kills = (killer.kills || 0) + 1;
      victim.alive = false;
      victim.health = 0;

      console.log(`[socket] ${killer.username} killed ${victim.username}. Kills: ${killer.kills}`);

      // Notify victim with 3s respawn countdown + killer's kills
      io.to(socket.id).emit("player-hit", {
        killerSocketId,
        killerUsername: killer.username,
        killerKills: killer.kills,
        respawnInMs: 3000
      });

      // Notify everyone else (so they update scoreboard + remove victim sprite)
      broadcastToRoom(io, currentRoomCode, "player-died", {
        victimSocketId: socket.id,
        victimUsername: victim.username,
        killerSocketId,
        killerUsername: killer.username,
        killerKills: killer.kills
      }, socket.id);

      // Update DB kills (async, no block)
      MiniRoom.findOne({ roomCode: currentRoomCode }).then((doc) => {
        if (!doc) return;
        const dbKiller = doc.players.find(pl => pl.username === killer.username);
        if (dbKiller) dbKiller.kills = killer.kills;
        doc.save().catch(() => {});
      }).catch(() => {});
    });

    // ---------- RESPAWN ----------
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

      // Notify all (including self)
      io.to(currentRoomCode).emit("player-respawned", {
        socketId: socket.id,
        username: p.username,
        x: p.x, y: p.y,
        health: p.health,
        kills: p.kills
      });
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

      // If room is empty, clean up
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
