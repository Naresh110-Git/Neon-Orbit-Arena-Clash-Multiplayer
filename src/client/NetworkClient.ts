import { io, Socket } from 'socket.io-client';
import {
  GameStateSnapshot,
  PlayerInput,
  RoomResponse,
  GameEvent,
  LobbyPlayer,
  PublicRoomInfo,
} from '../shared/types.js';

export interface RoomStateData {
  roomCode: string;
  players: LobbyPlayer[];
  isHost: boolean;
  minPlayers: number;
  phase: string;
}

export class NetworkClient {
  private socket: Socket;
  private localPlayerId: string | null = null;
  private currentRoomCode: string | null = null;
  private sessionToken: string | null = null;
  private isHost: boolean = false;
  private ping: number = 0;
  private pingInterval: number | null = null;

  // Callbacks
  public onRoomState: ((data: RoomStateData) => void) | null = null;
  public onGameState: ((snapshot: GameStateSnapshot) => void) | null = null;
  public onGameEvent: ((event: GameEvent) => void) | null = null;
  public onPublicRoomsUpdate: ((rooms: PublicRoomInfo[]) => void) | null = null;
  public onError: ((error: string) => void) | null = null;
  public onConnectStatusChange: ((connected: boolean) => void) | null = null;

  constructor() {
    this.socket = io({
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.bindSocketEvents();
    this.startPingMonitor();
  }

  private bindSocketEvents(): void {
    this.socket.on('connect', () => {
      this.localPlayerId = this.socket.id || null;
      if (this.onConnectStatusChange) this.onConnectStatusChange(true);
    });

    this.socket.on('disconnect', () => {
      if (this.onConnectStatusChange) this.onConnectStatusChange(false);
    });

    this.socket.on('public_rooms_update', (rooms: PublicRoomInfo[]) => {
      if (this.onPublicRoomsUpdate) this.onPublicRoomsUpdate(rooms);
    });

    this.socket.on('room_state', (data: RoomStateData) => {
      this.currentRoomCode = data.roomCode;
      this.isHost = data.isHost;
      if (this.onRoomState) this.onRoomState(data);
    });

    this.socket.on('game_state', (snapshot: GameStateSnapshot) => {
      if (this.onGameState) this.onGameState(snapshot);
    });

    this.socket.on('game_event', (evt: GameEvent) => {
      if (this.onGameEvent) this.onGameEvent(evt);
    });

    this.socket.on('error_message', (msg: string) => {
      if (this.onError) this.onError(msg);
    });
  }

  public createRoom(nickname: string, withBots: boolean = false): Promise<RoomResponse> {
    return new Promise((resolve) => {
      this.socket.emit('create_room', { nickname, withBots }, (response: RoomResponse) => {
        if (response.success && response.roomCode) {
          this.currentRoomCode = response.roomCode;
          this.localPlayerId = response.playerId || this.socket.id || null;
          this.isHost = Boolean(response.isHost);
          if (response.sessionToken) {
            this.sessionToken = response.sessionToken;
            sessionStorage.setItem('neon_orbit_room', response.roomCode);
            sessionStorage.setItem('neon_orbit_token', response.sessionToken);
          }
        }
        resolve(response);
      });
    });
  }

  public joinRoom(roomCode: string, nickname: string): Promise<RoomResponse> {
    return new Promise((resolve) => {
      const storedToken = sessionStorage.getItem('neon_orbit_token') || undefined;
      this.socket.emit('join_room', { roomCode, nickname, sessionToken: storedToken }, (response: RoomResponse) => {
        if (response.success && response.roomCode) {
          this.currentRoomCode = response.roomCode;
          this.localPlayerId = response.playerId || this.socket.id || null;
          this.isHost = Boolean(response.isHost);
          if (response.sessionToken) {
            this.sessionToken = response.sessionToken;
            sessionStorage.setItem('neon_orbit_room', response.roomCode);
            sessionStorage.setItem('neon_orbit_token', response.sessionToken);
          }
        }
        resolve(response);
      });
    });
  }

  public tryResumeSession(): Promise<RoomResponse | null> {
    const roomCode = sessionStorage.getItem('neon_orbit_room');
    const sessionToken = sessionStorage.getItem('neon_orbit_token');
    if (!roomCode || !sessionToken) return Promise.resolve(null);

    return new Promise((resolve) => {
      this.socket.emit('reconnect_session', { roomCode, sessionToken }, (response: RoomResponse) => {
        if (response.success) {
          this.currentRoomCode = roomCode;
          this.sessionToken = sessionToken;
          this.localPlayerId = response.playerId || this.socket.id || null;
          resolve(response);
        } else {
          sessionStorage.removeItem('neon_orbit_room');
          sessionStorage.removeItem('neon_orbit_token');
          resolve(null);
        }
      });
    });
  }

  public addBot(): void {
    this.socket.emit('add_bot');
  }

  public removeBot(): void {
    this.socket.emit('remove_bot');
  }

  public sendInput(input: PlayerInput): void {
    this.socket.emit('player_input', input);
  }

  public startGame(): void {
    this.socket.emit('start_game');
  }

  public rematch(): void {
    this.socket.emit('rematch');
  }

  public getLocalPlayerId(): string | null {
    return this.localPlayerId;
  }

  public getCurrentRoomCode(): string | null {
    return this.currentRoomCode;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  public getPing(): number {
    return this.ping;
  }

  private startPingMonitor(): void {
    this.pingInterval = window.setInterval(() => {
      if (!this.socket.connected) return;
      const start = performance.now();
      this.socket.emit('ping_check', start, (clientTime: number) => {
        const rtt = Math.round(performance.now() - clientTime);
        this.ping = rtt;
        this.socket.emit('player_ping', rtt);
      });
    }, 3000);
  }

  public destroy(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.socket.disconnect();
  }
}
