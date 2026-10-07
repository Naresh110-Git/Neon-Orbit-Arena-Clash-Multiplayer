import { Server, Socket } from 'socket.io';
import { GameEngine } from './GameEngine.js';
import { GAME_CONSTANTS } from '../shared/constants.js';
import { PlayerInput, LobbyPlayer, PublicRoomInfo } from '../shared/types.js';

export class GameRoom {
  public readonly code: string;
  private io: Server;
  private engine: GameEngine;
  private playerSockets: Map<string, Socket> = new Map();
  private socketToToken: Map<string, string> = new Map();
  private tokenToSocket: Map<string, string> = new Map();
  private hostSocketId: string | null = null;
  private hostNickname: string = 'Host';
  private tickInterval: NodeJS.Timeout | null = null;
  public lastActivityTimestamp: number = Date.now();
  private nextColorIndex: number = 0;

  constructor(code: string, io: Server) {
    this.code = code;
    this.io = io;
    this.engine = new GameEngine();
    this.startSimulationLoop();
  }

  public addPlayer(
    socket: Socket,
    nickname: string,
    existingToken?: string
  ): { playerId: string; sessionToken: string; isHost: boolean } {
    this.lastActivityTimestamp = Date.now();
    const isHost = this.playerSockets.size === 0 || this.hostSocketId === null;
    if (isHost) {
      this.hostSocketId = socket.id;
      this.hostNickname = nickname;
    }

    const sessionToken = existingToken || `tok_${Math.random().toString(36).substring(2)}${Date.now()}`;
    const colorIndex = this.nextColorIndex % GAME_CONSTANTS.PLAYER_COLORS.length;
    this.nextColorIndex++;

    this.playerSockets.set(socket.id, socket);
    this.socketToToken.set(socket.id, sessionToken);
    this.tokenToSocket.set(sessionToken, socket.id);
    socket.join(this.code);

    const sanitizedNickname = (nickname.trim().slice(0, 14) || `Pilot-${socket.id.slice(0, 4)}`);
    this.engine.addPlayer(socket.id, sanitizedNickname, colorIndex, isHost, sessionToken);

    this.bindSocketEvents(socket);
    this.broadcastLobbyState();

    return { playerId: socket.id, sessionToken, isHost };
  }

  public reconnectSocket(socket: Socket, sessionToken: string): boolean {
    const existingPlayer = this.engine.reconnectPlayer(sessionToken, socket.id);
    if (!existingPlayer) return false;

    // Clean up old socket reference
    const oldSocketId = this.tokenToSocket.get(sessionToken);
    if (oldSocketId && oldSocketId !== socket.id) {
      this.playerSockets.delete(oldSocketId);
      this.socketToToken.delete(oldSocketId);
    }

    this.playerSockets.set(socket.id, socket);
    this.socketToToken.set(socket.id, sessionToken);
    this.tokenToSocket.set(sessionToken, socket.id);
    socket.join(this.code);

    if (existingPlayer.isHost) {
      this.hostSocketId = socket.id;
      this.hostNickname = existingPlayer.nickname;
    }

    this.bindSocketEvents(socket);
    this.broadcastLobbyState();
    return true;
  }

  public removePlayer(socketId: string): void {
    this.lastActivityTimestamp = Date.now();
    this.playerSockets.delete(socketId);
    const token = this.socketToToken.get(socketId);
    if (token) {
      this.socketToToken.delete(socketId);
      this.tokenToSocket.delete(token);
    }
    this.engine.removePlayer(socketId);

    // Elect new host if host left
    if (this.hostSocketId === socketId) {
      const nextSocket = this.playerSockets.values().next().value;
      if (nextSocket) {
        this.hostSocketId = nextSocket.id;
        const snap = this.engine.createSnapshot();
        const p = snap.players.find(x => x.id === nextSocket.id);
        if (p) {
          p.isHost = true;
          this.hostNickname = p.nickname;
        }
      } else {
        this.hostSocketId = null;
      }
    }

    this.broadcastLobbyState();
  }

  public addBot(): boolean {
    const colorIndex = this.nextColorIndex % GAME_CONSTANTS.PLAYER_COLORS.length;
    this.nextColorIndex++;
    const bot = this.engine.addBot(colorIndex);
    if (bot) {
      this.broadcastLobbyState();
      return true;
    }
    return false;
  }

  public removeBot(): boolean {
    const removed = this.engine.removeBot();
    if (removed) {
      this.broadcastLobbyState();
      return true;
    }
    return false;
  }

  public getPlayerCount(): number {
    return this.engine.getPlayerCount();
  }

  public getHumanCount(): number {
    return this.playerSockets.size;
  }

  public isEmpty(): boolean {
    return this.playerSockets.size === 0;
  }

  public getPublicInfo(): PublicRoomInfo {
    return {
      roomCode: this.code,
      hostNickname: this.hostNickname || 'Commander',
      playerCount: this.engine.getPlayerCount(),
      maxPlayers: GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM,
      phase: this.engine.getPhase(),
    };
  }

  public startGame(requestingSocketId: string): boolean {
    if (this.hostSocketId && this.hostSocketId !== requestingSocketId) {
      return false;
    }
    this.engine.startCountdown();
    this.lastActivityTimestamp = Date.now();
    return true;
  }

  public resetForRematch(): void {
    this.engine.resetForRematch();
    this.lastActivityTimestamp = Date.now();
    this.broadcastLobbyState();
  }

  private bindSocketEvents(socket: Socket): void {
    // Avoid double binding
    socket.removeAllListeners('player_input');
    socket.removeAllListeners('start_game');
    socket.removeAllListeners('rematch');
    socket.removeAllListeners('ping_check');
    socket.removeAllListeners('player_ping');
    socket.removeAllListeners('add_bot');
    socket.removeAllListeners('remove_bot');

    socket.on('player_input', (input: PlayerInput) => {
      this.engine.updatePlayerInput(socket.id, input);
    });

    socket.on('start_game', () => {
      this.startGame(socket.id);
    });

    socket.on('rematch', () => {
      this.resetForRematch();
      this.startGame(socket.id);
    });

    socket.on('add_bot', () => {
      this.addBot();
    });

    socket.on('remove_bot', () => {
      this.removeBot();
    });

    socket.on('ping_check', (clientTime: number, callback: (clientTime: number) => void) => {
      if (typeof callback === 'function') {
        callback(clientTime);
      }
    });

    socket.on('player_ping', (ping: number) => {
      this.engine.setPlayerPing(socket.id, ping);
    });
  }

  private startSimulationLoop(): void {
    if (this.tickInterval) return;

    this.tickInterval = setInterval(() => {
      if (this.engine.getPlayerCount() > 0) {
        const { snapshot, events } = this.engine.tick();

        this.io.to(this.code).emit('game_state', snapshot);

        if (events.length > 0) {
          events.forEach((evt) => {
            this.io.to(this.code).emit('game_event', evt);
          });
        }
      }
    }, GAME_CONSTANTS.TICK_INTERVAL_MS);
  }

  public broadcastLobbyState(): void {
    const snapshot = this.engine.createSnapshot();
    const lobbyPlayers: LobbyPlayer[] = snapshot.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      colorIndex: p.colorIndex,
      isHost: p.id === this.hostSocketId,
      isBot: p.isBot,
      score: p.score,
    }));

    this.playerSockets.forEach((socket) => {
      socket.emit('room_state', {
        roomCode: this.code,
        players: lobbyPlayers,
        isHost: socket.id === this.hostSocketId,
        minPlayers: GAME_CONSTANTS.MIN_PLAYERS_TO_START,
        phase: snapshot.phase,
      });
    });
  }

  public destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.playerSockets.clear();
    this.socketToToken.clear();
    this.tokenToSocket.clear();
  }
}
