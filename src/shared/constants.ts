export const GAME_CONSTANTS = {
  // Arena
  ARENA_WIDTH: 1600,
  ARENA_HEIGHT: 1200,
  ARENA_RADIUS: 650, // Circular boundary radius from center
  CENTER_X: 800,
  CENTER_Y: 600,

  // Loop & Sync
  SERVER_TICK_RATE: 30, // 30Hz
  TICK_INTERVAL_MS: 1000 / 30,

  // Gameplay Timers
  COUNTDOWN_DURATION_SEC: 3,
  ROUND_DURATION_SEC: 75,
  SHRINK_START_SEC: 30, // Shrinking starts when 30s remain
  MIN_ARENA_RADIUS: 250, // Smallest radius during sudden death

  // Player Physics
  PLAYER_RADIUS: 22,
  MAX_SPEED: 380, // pixels per second
  ACCELERATION: 1200,
  FRICTION: 0.94,
  BOOST_SPEED_MULTIPLIER: 1.85,
  BOOST_MAX_CHARGE: 100,
  BOOST_DRAIN_RATE: 45, // per second while boosting
  BOOST_RECHARGE_RATE: 15, // per second when not boosting

  // Knockback & Collisions
  COLLISION_BOUNCE: 1.3,
  PULSE_RADIUS: 140,
  PULSE_FORCE: 600,
  PULSE_COOLDOWN_MS: 3500,

  // Orbs & Scoring
  MAX_ORBS: 32,
  ORB_RADIUS: 9,
  ORB_RESPAWN_DELAY_MS: 1800,
  POINTS_ORB: 10,
  POINTS_SUPER_ORB: 35,
  POINTS_KNOCKOUT: 50,
  POINTS_SURVIVAL_PER_SEC: 1,

  // Room & Network
  MAX_PLAYERS_PER_ROOM: 8,
  MIN_PLAYERS_TO_START: 1, // Can test solo or with group
  ROOM_CODE_LENGTH: 4,
  ROOM_INACTIVE_TIMEOUT_MS: 120000, // 2 minutes empty room GC

  // Color Palette (High contrast cyberpunk neon)
  PLAYER_COLORS: [
    { primary: '#00f0ff', glow: 'rgba(0, 240, 255, 0.6)', name: 'Cyan' },
    { primary: '#ff0055', glow: 'rgba(255, 0, 85, 0.6)', name: 'Neon Pink' },
    { primary: '#39ff14', glow: 'rgba(57, 255, 20, 0.6)', name: 'Lime' },
    { primary: '#ffe600', glow: 'rgba(255, 230, 0, 0.6)', name: 'Yellow' },
    { primary: '#b800ff', glow: 'rgba(184, 0, 255, 0.6)', name: 'Purple' },
    { primary: '#ff6b00', glow: 'rgba(255, 107, 0, 0.6)', name: 'Orange' },
    { primary: '#00ffc2', glow: 'rgba(0, 255, 194, 0.6)', name: 'Aquamarine' },
    { primary: '#ff3399', glow: 'rgba(255, 51, 153, 0.6)', name: 'Rose' },
  ],
};
