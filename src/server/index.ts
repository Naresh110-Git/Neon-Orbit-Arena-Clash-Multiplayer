import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { RoomManager } from './RoomManager.js';
import { RoomResponse, PublicRoomInfo } from '../shared/types.js';
import { GAME_CONSTANTS } from '../shared/constants.js';

process.on('uncaughtException', (err) => {
  console.error('[Server Process] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

const clientDistPath = path.resolve(__dirname, '../../dist/client');
app.use(express.static(clientDistPath));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    game: 'Neon Orbit: Arena Clash',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Attach Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const roomManager = new RoomManager(io);

// Public API endpoint for active rooms
app.get('/api/rooms', (_req, res) => {
  res.json({
    rooms: roomManager.getPublicRooms(),
    timestamp: Date.now(),
  });
});

// Socket.io Connection & Room Routing
io.on('connection', (socket: Socket) => {
  try {
    socket.emit('public_rooms_update', roomManager.getPublicRooms());
  } catch (err) {
    console.error('[Server] Error sending initial public rooms:', err);
  }

  // 1. Create Room Handler
  socket.on(
    'create_room',
    (data: { nickname?: string; withBots?: boolean }, callback: (res: RoomResponse) => void) => {
      try {
        const room = roomManager.createRoom();
        const nickname = (data?.nickname || '').trim() || `Pilot-${socket.id.slice(0, 4)}`;
        const { playerId, sessionToken, isHost } = room.addPlayer(socket, nickname);
        roomManager.registerSocketInRoom(socket.id, room.code);

        if (data?.withBots) {
          room.addBot();
          room.addBot();
          room.addBot();
        }

        if (typeof callback === 'function') {
          callback({
            success: true,
            roomCode: room.code,
            playerId,
            sessionToken,
            isHost,
          });
        }
      } catch (err: any) {
        console.error('[Server] Error creating room:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Failed to create room' });
        }
      }
    }
  );

  // 2. Join Room Handler
  socket.on(
    'join_room',
    (
      data: { roomCode: string; nickname?: string; sessionToken?: string },
      callback: (res: RoomResponse) => void
    ) => {
      try {
        const roomCode = (data?.roomCode || '').toUpperCase().trim();
        const room = roomManager.getRoom(roomCode);

        if (!room) {
          if (typeof callback === 'function') {
            callback({ success: false, error: `Room "${roomCode}" not found.` });
          }
          return;
        }

        if (data?.sessionToken && room.reconnectSocket(socket, data.sessionToken)) {
          roomManager.registerSocketInRoom(socket.id, room.code);
          if (typeof callback === 'function') {
            callback({
              success: true,
              roomCode: room.code,
              playerId: socket.id,
              sessionToken: data.sessionToken,
              isHost: false,
            });
          }
          return;
        }

        if (room.getPlayerCount() >= GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM) {
          if (typeof callback === 'function') {
            callback({ success: false, error: 'Room is full (max 8 pilots).' });
          }
          return;
        }

        const nickname = (data?.nickname || '').trim() || `Pilot-${socket.id.slice(0, 4)}`;
        const { playerId, sessionToken, isHost } = room.addPlayer(socket, nickname, data?.sessionToken);
        roomManager.registerSocketInRoom(socket.id, room.code);

        if (typeof callback === 'function') {
          callback({
            success: true,
            roomCode: room.code,
            playerId,
            sessionToken,
            isHost,
          });
        }
      } catch (err: any) {
        console.error('[Server] Error joining room:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Failed to join room' });
        }
      }
    }
  );

  // 3. Reconnect Session Handler
  socket.on(
    'reconnect_session',
    (data: { roomCode: string; sessionToken: string }, callback: (res: RoomResponse) => void) => {
      try {
        const roomCode = (data?.roomCode || '').toUpperCase().trim();
        const room = roomManager.getRoom(roomCode);
        if (room && data?.sessionToken && room.reconnectSocket(socket, data.sessionToken)) {
          roomManager.registerSocketInRoom(socket.id, room.code);
          if (typeof callback === 'function') {
            callback({
              success: true,
              roomCode: room.code,
              playerId: socket.id,
              sessionToken: data.sessionToken,
            });
          }
        } else {
          if (typeof callback === 'function') {
            callback({ success: false, error: 'Session expired or room unavailable.' });
          }
        }
      } catch (err: any) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Failed to resume session.' });
        }
      }
    }
  );

  // 4. Request Public Rooms List
  socket.on('get_public_rooms', (callback: (rooms: PublicRoomInfo[]) => void) => {
    try {
      if (typeof callback === 'function') {
        callback(roomManager.getPublicRooms());
      }
    } catch (err) {
      console.error('[Server] Error getting public rooms:', err);
    }
  });

  // 5. Disconnect Handler
  socket.on('disconnect', () => {
    try {
      roomManager.handleSocketDisconnect(socket.id);
    } catch (err) {
      console.error('[Server] Error handling disconnect:', err);
    }
  });
});

// SPA Fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Neon Orbit Server</title></head>
          <body style="background:#0a0a14;color:#00f0ff;font-family:sans-serif;text-align:center;padding-top:100px;">
            <h1>Neon Orbit: Arena Clash</h1>
            <p>Server is running. Run <code>npm run dev</code> for local development or <code>npm run build</code> for production client.</p>
          </body>
        </html>
      `);
    }
  });
});

const DEFAULT_PORT = Number(process.env.PORT) || 3000;

function listenWithFallback(port: number) {
  const errorHandler = (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ [Server] Port ${port} is currently in use by another application. Trying port ${port + 1}...`);
      httpServer.removeListener('error', errorHandler);
      listenWithFallback(port + 1);
    } else {
      console.error('[Server] Listen error:', err);
    }
  };

  httpServer.once('error', errorHandler);

  httpServer.listen(port, () => {
    httpServer.removeListener('error', errorHandler);
    console.log(`\n=================================================`);
    console.log(`🚀 Neon Orbit Multiplayer Server listening on port ${port}`);
    console.log(`📡 WebSocket ready with Socket.io`);
    console.log(`🎮 Game Ready: http://localhost:${port}`);
    console.log(`=================================================\n`);
  });
}

listenWithFallback(DEFAULT_PORT);
