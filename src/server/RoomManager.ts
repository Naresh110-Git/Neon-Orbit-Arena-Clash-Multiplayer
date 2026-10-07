import { Server } from 'socket.io';
import { GameRoom } from './GameRoom.js';
import { GAME_CONSTANTS } from '../shared/constants.js';
import { PublicRoomInfo } from '../shared/types.js';

export class RoomManager {
  private io: Server;
  private rooms: Map<string, GameRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  private static CODE_WORDS = [
    'NEON', 'WARP', 'NOVA', 'FLUX', 'APEX', 'BOLT', 'CYBR', 'DASH',
    'ECHO', 'FURY', 'GLOW', 'HALO', 'JOLT', 'LUNA', 'MYTH', 'ORBT',
    'PULS', 'RAVE', 'SOLR', 'TRBO', 'VLTS', 'WAVE', 'XRAY', 'ZAPS',
    'STAR', 'RUSH', 'BEAM', 'GRID', 'HYPR', 'VIBE', 'SONC', 'SHFT'
  ];

  constructor(io: Server) {
    this.io = io;

    this.cleanupInterval = setInterval(() => {
      try {
        this.cleanupStaleRooms();
      } catch (err) {
        console.error('[RoomManager] Error during cleanup:', err);
      }
    }, 30000);
  }

  public createRoom(): GameRoom {
    const code = this.generateUniqueRoomCode();
    const room = new GameRoom(code, this.io);
    this.rooms.set(code, room);
    console.log(`[RoomManager] Created room ${code}. Total active rooms: ${this.rooms.size}`);
    this.broadcastPublicRooms();
    return room;
  }

  public getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  public registerSocketInRoom(socketId: string, roomCode: string): void {
    this.socketToRoom.set(socketId, roomCode);
    this.broadcastPublicRooms();
  }

  public handleSocketDisconnect(socketId: string): void {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return;

    this.socketToRoom.delete(socketId);
    const room = this.rooms.get(roomCode);
    if (room) {
      room.removePlayer(socketId);
      console.log(`[RoomManager] Player ${socketId} disconnected from room ${roomCode}. Remaining: ${room.getPlayerCount()}`);
      if (room.isEmpty()) {
        room.lastActivityTimestamp = Date.now();
      }
      this.broadcastPublicRooms();
    }
  }

  public getPublicRooms(): PublicRoomInfo[] {
    const list: PublicRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      try {
        list.push(room.getPublicInfo());
      } catch (err) {
        console.error('[RoomManager] Error getting room public info:', err);
      }
    }
    return list;
  }

  public broadcastPublicRooms(): void {
    try {
      const publicRooms = this.getPublicRooms();
      this.io.emit('public_rooms_update', publicRooms);
    } catch (err) {
      console.error('[RoomManager] Error broadcasting public rooms:', err);
    }
  }

  private generateUniqueRoomCode(): string {
    const availableWords = RoomManager.CODE_WORDS.filter(w => !this.rooms.has(w));
    if (availableWords.length > 0) {
      return availableWords[Math.floor(Math.random() * availableWords.length)];
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < GAME_CONSTANTS.ROOM_CODE_LENGTH; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));

    return code;
  }

  private cleanupStaleRooms(): void {
    const now = Date.now();
    let changed = false;
    const entries = Array.from(this.rooms.entries());
    for (const [code, room] of entries) {
      if (room.isEmpty() && now - room.lastActivityTimestamp > GAME_CONSTANTS.ROOM_INACTIVE_TIMEOUT_MS) {
        console.log(`[RoomManager] Cleaning up inactive empty room: ${code}`);
        room.destroy();
        this.rooms.delete(code);
        changed = true;
      }
    }
    if (changed) {
      this.broadcastPublicRooms();
    }
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
    for (const room of this.rooms.values()) {
      room.destroy();
    }
    this.rooms.clear();
    this.socketToRoom.clear();
  }
}
