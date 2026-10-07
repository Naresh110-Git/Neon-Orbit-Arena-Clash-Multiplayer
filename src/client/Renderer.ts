import { GAME_CONSTANTS } from '../shared/constants.js';
import { GameStateSnapshot, PlayerState, GameEvent } from '../shared/types.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
  life: number;
  maxLife: number;
}

interface PulseWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = window.innerWidth;
  private height: number = window.innerHeight;
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;

  // Visual effects
  private stars: { x: number; y: number; size: number; speed: number; alpha: number }[] = [];
  private particles: Particle[] = [];
  private pulseWaves: PulseWave[] = [];
  private playerTrails: Map<string, TrailPoint[]> = new Map();

  // Interpolation cache
  private previousSnapshot: GameStateSnapshot | null = null;
  private currentSnapshot: GameStateSnapshot | null = null;
  private snapshotReceivedTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Failed to get 2D context');
    this.ctx = context;

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    this.initStarfield();
  }

  private handleResize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);

    // Compute scale to fit ARENA_WIDTH x ARENA_HEIGHT comfortably
    const scaleX = this.width / GAME_CONSTANTS.ARENA_WIDTH;
    const scaleY = this.height / GAME_CONSTANTS.ARENA_HEIGHT;
    this.scale = Math.min(scaleX, scaleY) * 0.95;

    this.offsetX = (this.width - GAME_CONSTANTS.ARENA_WIDTH * this.scale) / 2;
    this.offsetY = (this.height - GAME_CONSTANTS.ARENA_HEIGHT * this.scale) / 2;
  }

  private initStarfield(): void {
    this.stars = [];
    for (let i = 0; i < 150; i++) {
      this.stars.push({
        x: Math.random() * GAME_CONSTANTS.ARENA_WIDTH,
        y: Math.random() * GAME_CONSTANTS.ARENA_HEIGHT,
        size: Math.random() * 2 + 0.6,
        speed: Math.random() * 0.4 + 0.1,
        alpha: Math.random() * 0.7 + 0.3,
      });
    }
  }

  public updateSnapshot(newSnapshot: GameStateSnapshot): void {
    this.previousSnapshot = this.currentSnapshot;
    this.currentSnapshot = newSnapshot;
    this.snapshotReceivedTime = performance.now();
  }

  public triggerEventEffects(event: GameEvent): void {
    if (event.type === 'ORB_COLLECT' && event.x !== undefined && event.y !== undefined) {
      const isSuper = event.extra === 'super';
      const color = isSuper ? '#ffe600' : '#00f0ff';
      const count = isSuper ? 24 : 12;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 150 + 50;
        this.particles.push({
          x: event.x,
          y: event.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          color,
          alpha: 1,
          size: Math.random() * 3 + 2,
          life: 0,
          maxLife: 0.45,
        });
      }
    } else if (event.type === 'PULSE_FIRED' && event.x !== undefined && event.y !== undefined) {
      this.pulseWaves.push({
        x: event.x,
        y: event.y,
        radius: 10,
        maxRadius: GAME_CONSTANTS.PULSE_RADIUS,
        color: '#b800ff',
        alpha: 0.9,
      });
    }
  }

  public render(localPlayerId: string | null): void {
    const ctx = this.ctx;
    const now = performance.now();

    // 1. Clear background
    ctx.fillStyle = '#060713';
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Camera Transform to arena coordinate space
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // 3. Render Starfield
    this.renderStars(ctx);

    // 4. Render Arena Boundary (Hazard Ring)
    const currentRadius = this.currentSnapshot?.arenaRadius ?? GAME_CONSTANTS.ARENA_RADIUS;
    const isShrinking = (this.currentSnapshot?.timeLeft ?? 99) <= GAME_CONSTANTS.SHRINK_START_SEC;
    this.renderArenaBoundary(ctx, currentRadius, isShrinking);

    // 5. Render Shockwave Pulses
    this.renderPulses(ctx);

    // 6. Render Orbs
    if (this.currentSnapshot) {
      this.renderOrbs(ctx, this.currentSnapshot.orbs);
    }

    // 7. Render Players with LERP Interpolation
    if (this.currentSnapshot) {
      this.renderPlayers(ctx, now, localPlayerId);
    }

    // 8. Render Particles
    this.renderParticles(ctx, 0.016);

    ctx.restore();
  }

  private renderStars(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const star of this.stars) {
      ctx.fillStyle = `rgba(200, 230, 255, ${star.alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderArenaBoundary(ctx: CanvasRenderingContext2D, radius: number, isShrinking: boolean): void {
    ctx.save();
    const cx = GAME_CONSTANTS.CENTER_X;
    const cy = GAME_CONSTANTS.CENTER_Y;

    // Outer dark mask outside arena
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.rect(GAME_CONSTANTS.ARENA_WIDTH * 1.5, -GAME_CONSTANTS.ARENA_HEIGHT * 0.5, -GAME_CONSTANTS.ARENA_WIDTH * 2, GAME_CONSTANTS.ARENA_HEIGHT * 2);
    ctx.fillStyle = 'rgba(2, 2, 8, 0.85)';
    ctx.fill();

    // Electric boundary ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = isShrinking ? 6 : 4;
    ctx.strokeStyle = isShrinking ? '#ff0055' : '#00f0ff';
    ctx.shadowColor = isShrinking ? '#ff0055' : '#00f0ff';
    ctx.shadowBlur = isShrinking ? 22 : 14;
    ctx.stroke();

    // Subtle inner grid lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    const step = 80;
    for (let x = cx - radius; x <= cx + radius; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, cy - radius);
      ctx.lineTo(x, cy + radius);
      ctx.stroke();
    }
    for (let y = cy - radius; y <= cy + radius; y += step) {
      ctx.beginPath();
      ctx.moveTo(cx - radius, y);
      ctx.lineTo(cx + radius, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderOrbs(ctx: CanvasRenderingContext2D, orbs: any[]): void {
    ctx.save();
    for (const orb of orbs) {
      const isSuper = orb.type === 'super';
      const color = isSuper ? '#ffe600' : '#00f0ff';
      const radius = isSuper ? 13 : GAME_CONSTANTS.ORB_RADIUS;

      // Glow halo
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = isSuper ? 'rgba(255, 230, 0, 0.25)' : 'rgba(0, 240, 255, 0.2)';
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isSuper ? 18 : 10;
      ctx.fill();
    }
    ctx.restore();
  }

  private renderPlayers(ctx: CanvasRenderingContext2D, now: number, localPlayerId: string | null): void {
    if (!this.currentSnapshot) return;

    // Calculate interpolation alpha (t)
    const elapsed = now - this.snapshotReceivedTime;
    const t = Math.min(1, Math.max(0, elapsed / GAME_CONSTANTS.TICK_INTERVAL_MS));

    const prevPlayersMap = new Map<string, PlayerState>();
    if (this.previousSnapshot) {
      for (const p of this.previousSnapshot.players) {
        prevPlayersMap.set(p.id, p);
      }
    }

    for (const currentP of this.currentSnapshot.players) {
      if (!currentP.alive) continue;

      const prevP = prevPlayersMap.get(currentP.id);
      let renderX = currentP.x;
      let renderY = currentP.y;
      let renderAngle = currentP.angle;

      // Linear Interpolation between snapshots
      if (prevP) {
        renderX = prevP.x + (currentP.x - prevP.x) * t;
        renderY = prevP.y + (currentP.y - prevP.y) * t;

        // Angle interpolation
        let diff = currentP.angle - prevP.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        renderAngle = prevP.angle + diff * t;
      }

      this.recordPlayerTrail(currentP.id, renderX, renderY);
      this.drawPlayerTrail(ctx, currentP.id, currentP.colorIndex);
      this.drawPlayerShip(ctx, currentP, renderX, renderY, renderAngle, currentP.id === localPlayerId);
    }
  }

  private recordPlayerTrail(id: string, x: number, y: number): void {
    let trail = this.playerTrails.get(id);
    if (!trail) {
      trail = [];
      this.playerTrails.set(id, trail);
    }
    trail.unshift({ x, y, alpha: 0.6 });
    if (trail.length > 8) trail.pop();
  }

  private drawPlayerTrail(ctx: CanvasRenderingContext2D, id: string, colorIdx: number): void {
    const trail = this.playerTrails.get(id);
    if (!trail || trail.length < 2) return;

    const colorConfig = GAME_CONSTANTS.PLAYER_COLORS[colorIdx % GAME_CONSTANTS.PLAYER_COLORS.length];
    ctx.save();
    for (let i = 0; i < trail.length - 1; i++) {
      const p1 = trail[i];
      const p2 = trail[i + 1];
      const alpha = (1 - i / trail.length) * 0.4;
      ctx.strokeStyle = colorConfig.glow;
      ctx.lineWidth = (1 - i / trail.length) * (GAME_CONSTANTS.PLAYER_RADIUS * 0.8);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlayerShip(
    ctx: CanvasRenderingContext2D,
    player: PlayerState,
    x: number,
    y: number,
    angle: number,
    isLocal: boolean
  ): void {
    ctx.save();
    ctx.translate(x, y);

    const colorConfig = GAME_CONSTANTS.PLAYER_COLORS[player.colorIndex % GAME_CONSTANTS.PLAYER_COLORS.length];

    // Local player indicator ring
    if (isLocal) {
      ctx.beginPath();
      ctx.arc(0, 0, GAME_CONSTANTS.PLAYER_RADIUS + 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Boost glow aura
    if (player.isBoosting) {
      ctx.beginPath();
      ctx.arc(0, 0, GAME_CONSTANTS.PLAYER_RADIUS + 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 100, 0, 0.35)';
      ctx.fill();
    }

    // Rotate ship body to facing angle
    ctx.rotate(angle);

    // Ship Body (Futuristic Dart Fighter)
    const r = GAME_CONSTANTS.PLAYER_RADIUS;
    ctx.beginPath();
    ctx.moveTo(r + 4, 0); // Nose tip
    ctx.lineTo(-r + 4, -r * 0.85); // Left wing
    ctx.lineTo(-r * 0.45, 0); // Inner engine notch
    ctx.lineTo(-r + 4, r * 0.85); // Right wing
    ctx.closePath();

    ctx.fillStyle = '#0f1225';
    ctx.fill();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colorConfig.primary;
    ctx.shadowColor = colorConfig.primary;
    ctx.shadowBlur = 12;
    ctx.stroke();

    // Engine thruster flame
    if (player.isBoosting || Math.hypot(player.vx, player.vy) > 20) {
      const flameLen = player.isBoosting ? r * 1.5 : r * 0.7;
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -4);
      ctx.lineTo(-r * 0.45 - flameLen, 0);
      ctx.lineTo(-r * 0.45, 4);
      ctx.fillStyle = player.isBoosting ? '#ff3300' : '#00f0ff';
      ctx.shadowColor = player.isBoosting ? '#ff3300' : '#00f0ff';
      ctx.shadowBlur = 15;
      ctx.fill();
    }

    ctx.restore();

    // Overhead Nickname & Score
    ctx.save();
    ctx.translate(x, y - GAME_CONSTANTS.PLAYER_RADIUS - 14);
    ctx.fillStyle = isLocal ? '#00f0ff' : '#ffffff';
    ctx.font = 'bold 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(`${player.nickname} (${player.score})`, 0, 0);
    ctx.restore();
  }

  private renderPulses(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (let i = this.pulseWaves.length - 1; i >= 0; i--) {
      const wave = this.pulseWaves[i];
      wave.radius += 8;
      wave.alpha = Math.max(0, 1 - wave.radius / wave.maxRadius);

      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(184, 0, 255, ${wave.alpha})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = '#b800ff';
      ctx.shadowBlur = 12;
      ctx.stroke();

      if (wave.radius >= wave.maxRadius) {
        this.pulseWaves.splice(i, 1);
      }
    }
    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    ctx.save();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fill();

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
    ctx.restore();
  }
}
