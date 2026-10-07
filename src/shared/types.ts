export type GamePhase = 'LOBBY' | 'COUNTDOWN' | 'ACTIVE' | 'GAME_OVER';

export interface PlayerColor {
  primary: string;
  glow: string;
  name: string;
}

export interface PlayerState {
  id: string;
  nickname: string;
  colorIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  score: number;
  boost: number;
  isBoosting: boolean;
  pulseCooldownRemaining: number;
  alive: boolean;
  isHost: boolean;
  isBot?: boolean;
  ping: number;
}

export interface OrbState {
  id: number;
  x: number;
  y: number;
  type: 'standard' | 'super';
}

export interface GameStateSnapshot {
  tick: number;
  timestamp: number;
  phase: GamePhase;
  countdown: number;
  timeLeft: number;
  arenaRadius: number;
  players: PlayerState[];
  orbs: OrbState[];
  winnerId: string | null;
  winnerNickname: string | null;
}

export interface PlayerInput {
  dx: number; // -1 to 1
  dy: number; // -1 to 1
  boost: boolean;
  pulse: boolean;
  sequence: number;
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  colorIndex: number;
  isHost: boolean;
  isBot?: boolean;
  score: number;
}

export interface RoomResponse {
  success: boolean;
  error?: string;
  roomCode?: string;
  playerId?: string;
  sessionToken?: string;
  isHost?: boolean;
}

export interface PublicRoomInfo {
  roomCode: string;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
}

export type GameEventType =
  | 'ORB_COLLECT'
  | 'PULSE_FIRED'
  | 'PLAYER_KNOCKOUT'
  | 'GAME_START'
  | 'GAME_OVER'
  | 'COUNTDOWN_TICK';

export interface GameEvent {
  type: GameEventType;
  playerId?: string;
  x?: number;
  y?: number;
  extra?: string | number;
}
