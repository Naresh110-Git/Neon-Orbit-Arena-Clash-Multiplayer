import { GAME_CONSTANTS } from '../shared/constants.js';
import {
  GameStateSnapshot,
  PlayerState,
  OrbState,
  GamePhase,
  PlayerInput,
  GameEvent,
} from '../shared/types.js';

interface InternalPlayer extends PlayerState {
  targetDx: number;
  targetDy: number;
  wantsBoost: boolean;
  wantsPulse: boolean;
  lastInputTime: number;
  sessionToken?: string;
  isBot?: boolean;
}

export class GameEngine {
  private phase: GamePhase = 'LOBBY';
  private tickCount: number = 0;
  private countdownTimer: number = GAME_CONSTANTS.COUNTDOWN_DURATION_SEC;
  private roundTimer: number = GAME_CONSTANTS.ROUND_DURATION_SEC;
  private currentArenaRadius: number = GAME_CONSTANTS.ARENA_RADIUS;
  private players: Map<string, InternalPlayer> = new Map();
  private orbs: Map<number, OrbState> = new Map();
  private nextOrbId: number = 1;
  private lastOrbSpawnTime: number = 0;
  private winnerId: string | null = null;
  private winnerNickname: string | null = null;
  private eventQueue: GameEvent[] = [];
  private nextBotNumber: number = 1;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.phase = 'LOBBY';
    this.tickCount = 0;
    this.countdownTimer = GAME_CONSTANTS.COUNTDOWN_DURATION_SEC;
    this.roundTimer = GAME_CONSTANTS.ROUND_DURATION_SEC;
    this.currentArenaRadius = GAME_CONSTANTS.ARENA_RADIUS;
    this.orbs.clear();
    this.winnerId = null;
    this.winnerNickname = null;
    this.eventQueue = [];

    // Reset player positions, scores & physics
    this.players.forEach((player) => {
      this.resetPlayerSpawn(player);
      player.score = 0;
    });
  }

  public resetForRematch(): void {
    this.reset();
  }

  public addPlayer(
    id: string,
    nickname: string,
    colorIndex: number,
    isHost: boolean,
    sessionToken?: string
  ): PlayerState {
    const player: InternalPlayer = {
      id,
      nickname,
      colorIndex,
      x: GAME_CONSTANTS.CENTER_X,
      y: GAME_CONSTANTS.CENTER_Y,
      vx: 0,
      vy: 0,
      angle: 0,
      score: 0,
      boost: GAME_CONSTANTS.BOOST_MAX_CHARGE,
      isBoosting: false,
      pulseCooldownRemaining: 0,
      alive: true,
      isHost,
      isBot: false,
      ping: 0,
      targetDx: 0,
      targetDy: 0,
      wantsBoost: false,
      wantsPulse: false,
      lastInputTime: Date.now(),
      sessionToken,
    };

    this.resetPlayerSpawn(player);
    this.players.set(id, player);
    return this.toPublicPlayer(player);
  }

  public addBot(colorIndex: number): PlayerState | null {
    if (this.players.size >= GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM) return null;

    const botId = `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const botNames = ['CyberNova', 'QuantumByte', 'AegisAI', 'VortexBot', 'TitanPulse', 'EchoDroid'];
    const botName = botNames[(this.nextBotNumber - 1) % botNames.length] || `Bot-${this.nextBotNumber}`;
    this.nextBotNumber++;

    const player: InternalPlayer = {
      id: botId,
      nickname: botName,
      colorIndex,
      x: GAME_CONSTANTS.CENTER_X,
      y: GAME_CONSTANTS.CENTER_Y,
      vx: 0,
      vy: 0,
      angle: Math.random() * Math.PI * 2,
      score: 0,
      boost: GAME_CONSTANTS.BOOST_MAX_CHARGE,
      isBoosting: false,
      pulseCooldownRemaining: 0,
      alive: true,
      isHost: false,
      isBot: true,
      ping: 5,
      targetDx: 0,
      targetDy: 0,
      wantsBoost: false,
      wantsPulse: false,
      lastInputTime: Date.now(),
    };

    this.resetPlayerSpawn(player);
    this.players.set(botId, player);
    return this.toPublicPlayer(player);
  }

  public removeBot(botId?: string): boolean {
    if (botId) {
      const p = this.players.get(botId);
      if (p && p.isBot) {
        this.players.delete(botId);
        return true;
      }
      return false;
    }
    // Remove the last added bot
    for (const [id, p] of Array.from(this.players.entries()).reverse()) {
      if (p.isBot) {
        this.players.delete(id);
        return true;
      }
    }
    return false;
  }

  public reconnectPlayer(sessionToken: string, newSocketId: string): PlayerState | null {
    for (const [oldId, player] of this.players.entries()) {
      if (player.sessionToken === sessionToken && !player.isBot) {
        this.players.delete(oldId);
        player.id = newSocketId;
        this.players.set(newSocketId, player);
        return this.toPublicPlayer(player);
      }
    }
    return null;
  }

  public removePlayer(id: string): void {
    this.players.delete(id);
    if (this.phase === 'ACTIVE' && this.players.size <= 1) {
      this.checkEndGame();
    }
  }

  public setPlayerPing(id: string, ping: number): void {
    const p = this.players.get(id);
    if (p) p.ping = ping;
  }

  public updatePlayerInput(id: string, input: PlayerInput): void {
    const player = this.players.get(id);
    if (!player || !player.alive || player.isBot) return;

    let dx = Number(input.dx) || 0;
    let dy = Number(input.dy) || 0;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }

    player.targetDx = dx;
    player.targetDy = dy;
    player.wantsBoost = Boolean(input.boost);
    if (input.pulse) {
      player.wantsPulse = true;
    }
    player.lastInputTime = Date.now();
  }

  public startCountdown(): void {
    if (this.phase !== 'LOBBY') return;
    this.phase = 'COUNTDOWN';
    this.countdownTimer = GAME_CONSTANTS.COUNTDOWN_DURATION_SEC;
    this.eventQueue.push({ type: 'COUNTDOWN_TICK', extra: this.countdownTimer });

    this.populateInitialOrbs();
  }

  public tick(): { snapshot: GameStateSnapshot; events: GameEvent[] } {
    this.tickCount++;
    const dt = 1 / GAME_CONSTANTS.SERVER_TICK_RATE;

    if (this.phase === 'COUNTDOWN') {
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.phase = 'ACTIVE';
        this.roundTimer = GAME_CONSTANTS.ROUND_DURATION_SEC;
        this.eventQueue.push({ type: 'GAME_START' });
      }
    } else if (this.phase === 'ACTIVE') {
      this.updateActiveRound(dt);
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    return {
      snapshot: this.createSnapshot(),
      events,
    };
  }

  private updateActiveRound(dt: number): void {
    // 1. Advance timer
    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.roundTimer = 0;
      this.checkEndGame(true);
      return;
    }

    // 2. Shrink arena if in sudden death phase
    if (this.roundTimer <= GAME_CONSTANTS.SHRINK_START_SEC) {
      const shrinkProgress = (GAME_CONSTANTS.SHRINK_START_SEC - this.roundTimer) / GAME_CONSTANTS.SHRINK_START_SEC;
      const targetRadius = GAME_CONSTANTS.ARENA_RADIUS - (GAME_CONSTANTS.ARENA_RADIUS - GAME_CONSTANTS.MIN_ARENA_RADIUS) * shrinkProgress;
      this.currentArenaRadius = Math.max(GAME_CONSTANTS.MIN_ARENA_RADIUS, targetRadius);
    }

    // 3. Update Bot AI Decisions
    this.updateBotDecisions();

    // 4. Update player & bot physics
    this.players.forEach((player) => {
      if (!player.alive) return;

      // Handle Pulse Shockwave
      if (player.pulseCooldownRemaining > 0) {
        player.pulseCooldownRemaining = Math.max(0, player.pulseCooldownRemaining - dt * 1000);
      }
      if (player.wantsPulse && player.pulseCooldownRemaining <= 0) {
        player.pulseCooldownRemaining = GAME_CONSTANTS.PULSE_COOLDOWN_MS;
        player.wantsPulse = false;
        this.triggerPulseShockwave(player);
      }

      // Handle Boost
      let speedMult = 1.0;
      if (player.wantsBoost && player.boost > 5) {
        player.isBoosting = true;
        speedMult = GAME_CONSTANTS.BOOST_SPEED_MULTIPLIER;
        player.boost = Math.max(0, player.boost - GAME_CONSTANTS.BOOST_DRAIN_RATE * dt);
      } else {
        player.isBoosting = false;
        player.boost = Math.min(GAME_CONSTANTS.BOOST_MAX_CHARGE, player.boost + GAME_CONSTANTS.BOOST_RECHARGE_RATE * dt);
      }

      // Acceleration
      const ax = player.targetDx * GAME_CONSTANTS.ACCELERATION * speedMult;
      const ay = player.targetDy * GAME_CONSTANTS.ACCELERATION * speedMult;
      player.vx += ax * dt;
      player.vy += ay * dt;

      // Friction
      player.vx *= GAME_CONSTANTS.FRICTION;
      player.vy *= GAME_CONSTANTS.FRICTION;

      // Max Speed Clamp
      const maxSpd = GAME_CONSTANTS.MAX_SPEED * speedMult;
      const curSpd = Math.hypot(player.vx, player.vy);
      if (curSpd > maxSpd) {
        player.vx = (player.vx / curSpd) * maxSpd;
        player.vy = (player.vy / curSpd) * maxSpd;
      }

      // Position update
      player.x += player.vx * dt;
      player.y += player.vy * dt;

      // Orientation angle
      if (Math.hypot(player.vx, player.vy) > 10) {
        player.angle = Math.atan2(player.vy, player.vx);
      }

      // Arena boundary collision
      const distFromCenter = Math.hypot(
        player.x - GAME_CONSTANTS.CENTER_X,
        player.y - GAME_CONSTANTS.CENTER_Y
      );

      const maxAllowedDist = this.currentArenaRadius - GAME_CONSTANTS.PLAYER_RADIUS;
      if (distFromCenter > maxAllowedDist) {
        const nx = (player.x - GAME_CONSTANTS.CENTER_X) / (distFromCenter || 1);
        const ny = (player.y - GAME_CONSTANTS.CENTER_Y) / (distFromCenter || 1);

        player.x = GAME_CONSTANTS.CENTER_X + nx * maxAllowedDist;
        player.y = GAME_CONSTANTS.CENTER_Y + ny * maxAllowedDist;

        const dot = player.vx * nx + player.vy * ny;
        if (dot > 0) {
          player.vx -= 1.8 * dot * nx;
          player.vy -= 1.8 * dot * ny;
        }

        player.score = Math.max(0, player.score - 1);
      }
    });

    // 5. Resolve player vs player collisions (elastic bounce)
    const playerArray = Array.from(this.players.values()).filter((p) => p.alive);
    for (let i = 0; i < playerArray.length; i++) {
      for (let j = i + 1; j < playerArray.length; j++) {
        const p1 = playerArray[i];
        const p2 = playerArray[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = GAME_CONSTANTS.PLAYER_RADIUS * 2;

        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          p1.x -= nx * (overlap * 0.5);
          p1.y -= ny * (overlap * 0.5);
          p2.x += nx * (overlap * 0.5);
          p2.y += ny * (overlap * 0.5);

          const kx = p1.vx - p2.vx;
          const ky = p1.vy - p2.vy;
          const p = 2 * (nx * kx + ny * ky) / 2;

          p1.vx -= p * nx * GAME_CONSTANTS.COLLISION_BOUNCE;
          p1.vy -= p * ny * GAME_CONSTANTS.COLLISION_BOUNCE;
          p2.vx += p * nx * GAME_CONSTANTS.COLLISION_BOUNCE;
          p2.vy += p * ny * GAME_CONSTANTS.COLLISION_BOUNCE;
        }
      }
    }

    // 6. Check Orb Collection
    this.players.forEach((player) => {
      if (!player.alive) return;

      this.orbs.forEach((orb, orbId) => {
        const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
        if (dist < GAME_CONSTANTS.PLAYER_RADIUS + GAME_CONSTANTS.ORB_RADIUS) {
          const pts = orb.type === 'super' ? GAME_CONSTANTS.POINTS_SUPER_ORB : GAME_CONSTANTS.POINTS_ORB;
          player.score += pts;
          player.boost = Math.min(GAME_CONSTANTS.BOOST_MAX_CHARGE, player.boost + (orb.type === 'super' ? 40 : 15));

          this.eventQueue.push({
            type: 'ORB_COLLECT',
            playerId: player.id,
            x: orb.x,
            y: orb.y,
            extra: orb.type,
          });

          this.orbs.delete(orbId);
        }
      });
    });

    // 7. Respawn orbs
    const now = Date.now();
    if (this.orbs.size < GAME_CONSTANTS.MAX_ORBS && now - this.lastOrbSpawnTime > GAME_CONSTANTS.ORB_RESPAWN_DELAY_MS) {
      this.spawnOrb();
      this.lastOrbSpawnTime = now;
    }
  }

  private updateBotDecisions(): void {
    const orbsArray = Array.from(this.orbs.values());

    this.players.forEach((player) => {
      if (!player.isBot || !player.alive) return;

      // Find closest orb
      let closestOrb: OrbState | null = null;
      let closestDist = Infinity;

      for (const orb of orbsArray) {
        const d = Math.hypot(orb.x - player.x, orb.y - player.y);
        // Prefer super orbs
        const weight = orb.type === 'super' ? d * 0.6 : d;
        if (weight < closestDist) {
          closestDist = weight;
          closestOrb = orb;
        }
      }

      if (closestOrb) {
        const dx = closestOrb.x - player.x;
        const dy = closestOrb.y - player.y;
        const dist = Math.hypot(dx, dy) || 1;
        player.targetDx = dx / dist;
        player.targetDy = dy / dist;

        // Boost if target is far away and bot has plenty of boost
        player.wantsBoost = dist > 250 && player.boost > 60;
      } else {
        // Move towards center
        const dx = GAME_CONSTANTS.CENTER_X - player.x;
        const dy = GAME_CONSTANTS.CENTER_Y - player.y;
        const dist = Math.hypot(dx, dy) || 1;
        player.targetDx = dx / dist;
        player.targetDy = dy / dist;
        player.wantsBoost = false;
      }

      // Avoid outer edge boundary
      const distFromCenter = Math.hypot(player.x - GAME_CONSTANTS.CENTER_X, player.y - GAME_CONSTANTS.CENTER_Y);
      if (distFromCenter > this.currentArenaRadius - 90) {
        const toCenterX = (GAME_CONSTANTS.CENTER_X - player.x) / (distFromCenter || 1);
        const toCenterY = (GAME_CONSTANTS.CENTER_Y - player.y) / (distFromCenter || 1);
        player.targetDx = toCenterX;
        player.targetDy = toCenterY;
      }

      // Trigger pulse shockwave if rival human or bot is in range
      if (player.pulseCooldownRemaining <= 0) {
        for (const [otherId, other] of this.players.entries()) {
          if (otherId !== player.id && other.alive) {
            const rivalDist = Math.hypot(other.x - player.x, other.y - player.y);
            if (rivalDist < GAME_CONSTANTS.PULSE_RADIUS * 0.7) {
              player.wantsPulse = true;
              break;
            }
          }
        }
      }
    });
  }

  private triggerPulseShockwave(originPlayer: InternalPlayer): void {
    this.eventQueue.push({
      type: 'PULSE_FIRED',
      playerId: originPlayer.id,
      x: originPlayer.x,
      y: originPlayer.y,
    });

    this.players.forEach((target) => {
      if (target.id === originPlayer.id || !target.alive) return;

      const dx = target.x - originPlayer.x;
      const dy = target.y - originPlayer.y;
      const dist = Math.hypot(dx, dy);

      if (dist < GAME_CONSTANTS.PULSE_RADIUS && dist > 0) {
        const force = (1 - dist / GAME_CONSTANTS.PULSE_RADIUS) * GAME_CONSTANTS.PULSE_FORCE;
        const nx = dx / dist;
        const ny = dy / dist;

        target.vx += nx * force;
        target.vy += ny * force;

        originPlayer.score += 5;
      }
    });
  }

  private populateInitialOrbs(): void {
    this.orbs.clear();
    for (let i = 0; i < GAME_CONSTANTS.MAX_ORBS; i++) {
      this.spawnOrb();
    }
  }

  private spawnOrb(): void {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * (this.currentArenaRadius - 40);
    const x = GAME_CONSTANTS.CENTER_X + Math.cos(angle) * distance;
    const y = GAME_CONSTANTS.CENTER_Y + Math.sin(angle) * distance;
    const isSuper = Math.random() < 0.2;

    const orb: OrbState = {
      id: this.nextOrbId++,
      x,
      y,
      type: isSuper ? 'super' : 'standard',
    };

    this.orbs.set(orb.id, orb);
  }

  private resetPlayerSpawn(player: InternalPlayer): void {
    const total = Math.max(1, this.players.size);
    const index = Array.from(this.players.keys()).indexOf(player.id);
    const spawnAngle = (index / total) * Math.PI * 2;
    const spawnDist = Math.min(260, this.currentArenaRadius * 0.5);

    player.x = GAME_CONSTANTS.CENTER_X + Math.cos(spawnAngle) * spawnDist;
    player.y = GAME_CONSTANTS.CENTER_Y + Math.sin(spawnAngle) * spawnDist;
    player.vx = 0;
    player.vy = 0;
    player.angle = spawnAngle + Math.PI;
    player.boost = GAME_CONSTANTS.BOOST_MAX_CHARGE;
    player.isBoosting = false;
    player.pulseCooldownRemaining = 0;
    player.alive = true;
  }

  private checkEndGame(timeExpired: boolean = false): void {
    if (this.phase === 'GAME_OVER') return;

    if (timeExpired || (this.players.size > 1 && Array.from(this.players.values()).filter((p) => p.alive).length <= 1)) {
      this.phase = 'GAME_OVER';

      let highestScore = -1;
      let winner: InternalPlayer | null = null;
      this.players.forEach((p) => {
        if (p.score > highestScore) {
          highestScore = p.score;
          winner = p;
        }
      });

      if (winner) {
        this.winnerId = (winner as InternalPlayer).id;
        this.winnerNickname = (winner as InternalPlayer).nickname;
      }

      this.eventQueue.push({
        type: 'GAME_OVER',
        playerId: this.winnerId || undefined,
        extra: this.winnerNickname || 'No one',
      });
    }
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  public getPlayers(): Map<string, InternalPlayer> {
    return this.players;
  }

  private toPublicPlayer(p: InternalPlayer): PlayerState {
    return {
      id: p.id,
      nickname: p.nickname,
      colorIndex: p.colorIndex,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      vx: Math.round(p.vx * 10) / 10,
      vy: Math.round(p.vy * 10) / 10,
      angle: Math.round(p.angle * 100) / 100,
      score: p.score,
      boost: Math.round(p.boost),
      isBoosting: p.isBoosting,
      pulseCooldownRemaining: Math.round(p.pulseCooldownRemaining),
      alive: p.alive,
      isHost: p.isHost,
      isBot: p.isBot,
      ping: p.ping,
    };
  }

  public createSnapshot(): GameStateSnapshot {
    const playersList: PlayerState[] = [];
    this.players.forEach((p) => {
      playersList.push(this.toPublicPlayer(p));
    });

    return {
      tick: this.tickCount,
      timestamp: Date.now(),
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.countdownTimer)),
      timeLeft: Math.max(0, Math.ceil(this.roundTimer)),
      arenaRadius: Math.round(this.currentArenaRadius),
      players: playersList,
      orbs: Array.from(this.orbs.values()),
      winnerId: this.winnerId,
      winnerNickname: this.winnerNickname,
    };
  }
}
