import { NetworkClient, RoomStateData } from './NetworkClient.js';
import { Renderer } from './Renderer.js';
import { InputManager } from './InputManager.js';
import { SoundManager } from './SoundManager.js';
import { QRCodeGenerator } from './qr.js';
import { GameStateSnapshot, GameEvent, GamePhase, PublicRoomInfo } from '../shared/types.js';
import { GAME_CONSTANTS } from '../shared/constants.js';

class GameApp {
  private network: NetworkClient;
  private renderer: Renderer;
  private input: InputManager;
  private sound: SoundManager;

  // Screens
  private screenLanding = document.getElementById('screen-landing') as HTMLElement;
  private screenLobby = document.getElementById('screen-lobby') as HTMLElement;
  private screenGameOver = document.getElementById('screen-gameover') as HTMLElement;
  private gameHud = document.getElementById('game-hud') as HTMLElement;
  private countdownDisplay = document.getElementById('countdown-display') as HTMLElement;
  private errorToast = document.getElementById('error-toast') as HTMLElement;

  // Landing elements
  private inputNickname = document.getElementById('input-nickname') as HTMLInputElement;
  private inputRoomCode = document.getElementById('input-room-code') as HTMLInputElement;
  private btnCreateRoom = document.getElementById('btn-create-room') as HTMLButtonElement;
  private btnSoloBots = document.getElementById('btn-solo-bots') as HTMLButtonElement;
  private btnJoinRoom = document.getElementById('btn-join-room') as HTMLButtonElement;
  private directoryTbody = document.getElementById('directory-tbody') as HTMLElement;

  // Lobby elements
  private lobbyRoomCode = document.getElementById('lobby-room-code') as HTMLElement;
  private lobbyPlayerCount = document.getElementById('lobby-player-count') as HTMLElement;
  private lobbyRoster = document.getElementById('lobby-roster') as HTMLElement;
  private btnStartGame = document.getElementById('btn-start-game') as HTMLButtonElement;
  private hostHint = document.getElementById('host-hint') as HTMLElement;
  private btnCopyLink = document.getElementById('btn-copy-link') as HTMLButtonElement;
  private btnLeaveLobby = document.getElementById('btn-leave-lobby') as HTMLButtonElement;
  private btnAddBot = document.getElementById('btn-add-bot') as HTMLButtonElement;
  private btnRemoveBot = document.getElementById('btn-remove-bot') as HTMLButtonElement;
  private qrCanvas = document.getElementById('qr-canvas') as HTMLCanvasElement;

  // HUD elements
  private hudTimer = document.getElementById('hud-timer') as HTMLElement;
  private hudLeaderboard = document.getElementById('hud-leaderboard') as HTMLElement;
  private hudPing = document.getElementById('hud-ping') as HTMLElement;
  private boostBarFill = document.getElementById('boost-bar-fill') as HTMLElement;
  private btnToggleSound = document.getElementById('btn-toggle-sound') as HTMLButtonElement;

  // Game Over elements
  private winnerAnnouncement = document.getElementById('winner-announcement') as HTMLElement;
  private finalScoreboard = document.getElementById('final-scoreboard') as HTMLElement;
  private btnRematch = document.getElementById('btn-rematch') as HTMLButtonElement;
  private btnReturnLobby = document.getElementById('btn-return-lobby') as HTMLButtonElement;

  // App State
  private currentPhase: GamePhase = 'LOBBY';
  private lastCountdownVal: number = -1;
  private inputSendInterval: number | null = null;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.sound = new SoundManager();
    this.network = new NetworkClient();

    this.initMobileDOMRefs();
    this.bindDOMEvents();
    this.bindNetworkEvents();
    this.checkUrlParams();
    this.loadSavedNickname();
    this.attemptSessionResume();

    // Start 60 FPS Canvas Render Loop
    requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  private initMobileDOMRefs(): void {
    const mobileContainer = document.getElementById('mobile-controls') as HTMLElement;
    const baseEl = document.getElementById('joystick-base') as HTMLElement;
    const knobEl = document.getElementById('joystick-knob') as HTMLElement;
    const boostBtn = document.getElementById('btn-touch-boost') as HTMLElement;
    const pulseBtn = document.getElementById('btn-touch-pulse') as HTMLElement;
    this.input.initDOMRefs(mobileContainer, baseEl, knobEl, boostBtn, pulseBtn);
  }

  private loadSavedNickname(): void {
    const saved = localStorage.getItem('neon_orbit_nickname');
    if (saved && this.inputNickname) {
      this.inputNickname.value = saved;
    }
  }

  private checkUrlParams(): void {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl && this.inputRoomCode) {
      this.inputRoomCode.value = roomFromUrl.toUpperCase();
    }
  }

  private async attemptSessionResume(): Promise<void> {
    const res = await this.network.tryResumeSession();
    if (res && res.success && res.roomCode) {
      console.log(`[Session] Successfully resumed room ${res.roomCode}`);
      this.showLobby(res.roomCode, Boolean(res.isHost));
    }
  }

  private bindDOMEvents(): void {
    // Unlock Web Audio on first interaction
    const unlock = () => {
      this.sound.unlockAudio();
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);

    // Sound toggle
    this.btnToggleSound.addEventListener('click', () => {
      const isMuted = this.sound.toggleMute();
      this.btnToggleSound.textContent = isMuted ? '🔇' : '🔊';
    });

    // Create Room
    this.btnCreateRoom.addEventListener('click', async () => {
      const nickname = this.getNickname();
      this.btnCreateRoom.disabled = true;
      this.btnCreateRoom.textContent = 'INITIALIZING...';

      const res = await this.network.createRoom(nickname, false);
      this.btnCreateRoom.disabled = false;
      this.btnCreateRoom.textContent = 'CREATE A ROOM';

      if (res.success && res.roomCode) {
        this.showLobby(res.roomCode, true);
      } else {
        this.showToast(res.error || 'Failed to create room');
      }
    });

    // Solo Practice vs AI Bots
    this.btnSoloBots.addEventListener('click', async () => {
      const nickname = this.getNickname();
      this.btnSoloBots.disabled = true;
      this.btnSoloBots.textContent = 'PREPARING BOTS...';

      const res = await this.network.createRoom(nickname, true);
      this.btnSoloBots.disabled = false;
      this.btnSoloBots.textContent = '🤖 PLAY SOLO PRACTICE (VS AI BOTS)';

      if (res.success && res.roomCode) {
        this.showLobby(res.roomCode, true);
      } else {
        this.showToast(res.error || 'Failed to launch practice');
      }
    });

    // Join Room
    this.btnJoinRoom.addEventListener('click', async () => {
      const nickname = this.getNickname();
      const code = this.inputRoomCode.value.toUpperCase().trim();

      if (!code) {
        this.showToast('Please enter a 4-letter room code');
        return;
      }

      this.btnJoinRoom.disabled = true;
      this.btnJoinRoom.textContent = 'CONNECTING...';

      const res = await this.network.joinRoom(code, nickname);
      this.btnJoinRoom.disabled = false;
      this.btnJoinRoom.textContent = 'JOIN';

      if (res.success && res.roomCode) {
        this.showLobby(res.roomCode, Boolean(res.isHost));
      } else {
        this.showToast(res.error || 'Could not join room');
      }
    });

    // Copy Link
    this.btnCopyLink.addEventListener('click', () => {
      const code = this.network.getCurrentRoomCode();
      if (!code) return;
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        const originalText = this.btnCopyLink.textContent;
        this.btnCopyLink.textContent = '✅ Copied!';
        setTimeout(() => {
          this.btnCopyLink.textContent = originalText;
        }, 2000);
      });
    });

    // Start Game
    this.btnStartGame.addEventListener('click', () => {
      this.network.startGame();
    });

    // Bot Controls in Lobby
    this.btnAddBot.addEventListener('click', () => {
      this.network.addBot();
    });

    this.btnRemoveBot.addEventListener('click', () => {
      this.network.removeBot();
    });

    // Leave Lobby
    this.btnLeaveLobby.addEventListener('click', () => {
      sessionStorage.removeItem('neon_orbit_room');
      sessionStorage.removeItem('neon_orbit_token');
      window.location.href = window.location.pathname;
    });

    // Rematch
    this.btnRematch.addEventListener('click', () => {
      this.screenGameOver.classList.add('hidden');
      this.network.rematch();
    });

    // Return to Lobby
    this.btnReturnLobby.addEventListener('click', () => {
      this.screenGameOver.classList.add('hidden');
      this.screenLobby.classList.remove('hidden');
      this.gameHud.style.display = 'none';
      this.sound.stopMusic();
    });

    // Auto-uppercase room code input
    this.inputRoomCode.addEventListener('input', () => {
      this.inputRoomCode.value = this.inputRoomCode.value.toUpperCase();
    });
  }

  private bindNetworkEvents(): void {
    // Public rooms directory update
    this.network.onPublicRoomsUpdate = (rooms: PublicRoomInfo[]) => {
      this.updateDirectoryView(rooms);
    };

    // Room state update (players list, host status)
    this.network.onRoomState = (data: RoomStateData) => {
      this.updateLobbyView(data);
    };

    // Game state snapshot
    this.network.onGameState = (snapshot: GameStateSnapshot) => {
      this.renderer.updateSnapshot(snapshot);
      this.handleStatePhase(snapshot);
      this.updateHud(snapshot);
    };

    // Game events
    this.network.onGameEvent = (evt: GameEvent) => {
      this.renderer.triggerEventEffects(evt);

      if (evt.type === 'ORB_COLLECT') {
        this.sound.playOrbCollect(evt.extra === 'super');
      } else if (evt.type === 'PULSE_FIRED') {
        this.sound.playPulse();
      } else if (evt.type === 'GAME_OVER') {
        this.sound.stopMusic();
        this.sound.playVictory();
      } else if (evt.type === 'COUNTDOWN_TICK') {
        this.sound.playCountdown(false);
      } else if (evt.type === 'GAME_START') {
        this.sound.playCountdown(true);
        this.sound.startMusic();
      }
    };

    // Latency Ping update
    window.setInterval(() => {
      const ping = this.network.getPing();
      if (this.hudPing) {
        const color = ping < 60 ? '#39ff14' : (ping < 140 ? '#ffe600' : '#ff0055');
        this.hudPing.style.color = color;
        this.hudPing.textContent = `🟢 ${ping}ms`;
      }
    }, 1000);

    // Toast errors
    this.network.onError = (msg: string) => {
      this.showToast(msg);
    };
  }

  private updateDirectoryView(rooms: PublicRoomInfo[]): void {
    if (!this.directoryTbody) return;

    if (!rooms || rooms.length === 0) {
      this.directoryTbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-table-msg">No open public rooms right now. Create one above or launch solo practice!</td>
        </tr>
      `;
      return;
    }

    this.directoryTbody.innerHTML = rooms.map((r) => {
      const isFull = r.playerCount >= r.maxPlayers;
      const statusColor = r.phase === 'ACTIVE' ? '#ffe600' : '#39ff14';
      return `
        <tr>
          <td class="room-badge">${r.roomCode}</td>
          <td style="color:#fff;font-weight:600;">${r.hostNickname}</td>
          <td>${r.playerCount}/${r.maxPlayers}</td>
          <td><span style="color:${statusColor};font-weight:700;">${r.phase}</span></td>
          <td>
            <button class="btn-quick-join" data-code="${r.roomCode}" ${isFull ? 'disabled' : ''}>
              ${isFull ? 'FULL' : 'JOIN ROOM'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach click listener to Quick Join buttons
    const joinBtns = this.directoryTbody.querySelectorAll('.btn-quick-join');
    joinBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const code = (e.currentTarget as HTMLElement).getAttribute('data-code');
        if (code) {
          this.inputRoomCode.value = code;
          const nickname = this.getNickname();
          const res = await this.network.joinRoom(code, nickname);
          if (res.success && res.roomCode) {
            this.showLobby(res.roomCode, Boolean(res.isHost));
          } else {
            this.showToast(res.error || 'Failed to join room');
          }
        }
      });
    });
  }

  private handleStatePhase(snapshot: GameStateSnapshot): void {
    if (snapshot.phase !== this.currentPhase) {
      this.currentPhase = snapshot.phase;

      if (this.currentPhase === 'COUNTDOWN') {
        this.screenLobby.classList.add('hidden');
        this.screenLanding.classList.add('hidden');
        this.screenGameOver.classList.add('hidden');
        this.gameHud.style.display = 'flex';
        this.startInputStreaming();
        this.sound.startMusic();
      } else if (this.currentPhase === 'ACTIVE') {
        this.countdownDisplay.style.display = 'none';
        this.screenLobby.classList.add('hidden');
        this.screenGameOver.classList.add('hidden');
        this.gameHud.style.display = 'flex';
        this.startInputStreaming();
      } else if (this.currentPhase === 'GAME_OVER') {
        this.stopInputStreaming();
        this.sound.stopMusic();
        this.showGameOverModal(snapshot);
      } else if (this.currentPhase === 'LOBBY') {
        this.stopInputStreaming();
        this.sound.stopMusic();
        this.countdownDisplay.style.display = 'none';
        this.screenLobby.classList.remove('hidden');
        this.gameHud.style.display = 'none';
      }
    }

    // Countdown animation
    if (snapshot.phase === 'COUNTDOWN') {
      this.countdownDisplay.style.display = 'block';
      const c = snapshot.countdown;
      if (c !== this.lastCountdownVal) {
        this.lastCountdownVal = c;
        this.countdownDisplay.textContent = c > 0 ? String(c) : 'GO!';
        this.sound.playCountdown(c <= 0);
      }
    } else {
      this.countdownDisplay.style.display = 'none';
    }
  }

  private updateHud(snapshot: GameStateSnapshot): void {
    this.hudTimer.textContent = String(snapshot.timeLeft);
    if (snapshot.timeLeft <= GAME_CONSTANTS.SHRINK_START_SEC) {
      this.hudTimer.classList.add('urgent');
    } else {
      this.hudTimer.classList.remove('urgent');
    }

    const sorted = [...snapshot.players].sort((a, b) => b.score - a.score);
    this.hudLeaderboard.innerHTML = sorted.slice(0, 3).map((p, idx) => {
      const color = GAME_CONSTANTS.PLAYER_COLORS[p.colorIndex % GAME_CONSTANTS.PLAYER_COLORS.length].primary;
      const isMe = p.id === this.network.getLocalPlayerId();
      return `
        <div class="leaderboard-row" style="color:${color}; ${isMe ? 'font-weight:900;' : ''}">
          <span>${idx + 1}. ${p.nickname}${isMe ? ' (You)' : (p.isBot ? ' [BOT]' : '')}</span>
          <span>${p.score}</span>
        </div>
      `;
    }).join('');

    const localPlayer = snapshot.players.find(p => p.id === this.network.getLocalPlayerId());
    if (localPlayer) {
      const pct = Math.max(0, Math.min(100, localPlayer.boost));
      this.boostBarFill.style.width = `${pct}%`;
    }
  }

  private showLobby(roomCode: string, isHost: boolean): void {
    this.screenLanding.classList.add('hidden');
    this.screenLobby.classList.remove('hidden');
    this.lobbyRoomCode.textContent = roomCode;

    const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    QRCodeGenerator.renderToCanvas(this.qrCanvas, joinUrl, 4);

    this.btnStartGame.style.display = isHost ? 'block' : 'none';
    this.hostHint.style.display = isHost ? 'none' : 'block';
    this.btnAddBot.style.display = isHost ? 'inline-block' : 'none';
    this.btnRemoveBot.style.display = isHost ? 'inline-block' : 'none';
  }

  private updateLobbyView(data: RoomStateData): void {
    this.lobbyPlayerCount.textContent = String(data.players.length);
    this.btnStartGame.style.display = data.isHost ? 'block' : 'none';
    this.hostHint.style.display = data.isHost ? 'none' : 'block';
    this.btnAddBot.style.display = data.isHost ? 'inline-block' : 'none';
    this.btnRemoveBot.style.display = data.isHost ? 'inline-block' : 'none';

    this.lobbyRoster.innerHTML = data.players.map((p) => {
      const color = GAME_CONSTANTS.PLAYER_COLORS[p.colorIndex % GAME_CONSTANTS.PLAYER_COLORS.length].primary;
      const isMe = p.id === this.network.getLocalPlayerId();
      return `
        <div class="roster-item" style="border-left-color: ${color}">
          <span class="roster-name" style="color: ${color}">
            ${p.nickname} ${isMe ? '<small>(You)</small>' : ''}
          </span>
          <div>
            ${p.isBot ? '<span class="bot-tag">AI BOT</span>' : ''}
            ${p.isHost ? '<span class="host-tag">HOST</span>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  private showGameOverModal(snapshot: GameStateSnapshot): void {
    this.screenGameOver.classList.remove('hidden');

    const winnerName = snapshot.winnerNickname || 'No one';
    this.winnerAnnouncement.innerHTML = `🏆 Champion: <span style="color:#ffe600">${winnerName}</span>`;

    const sorted = [...snapshot.players].sort((a, b) => b.score - a.score);
    this.finalScoreboard.innerHTML = sorted.map((p, idx) => {
      const color = GAME_CONSTANTS.PLAYER_COLORS[p.colorIndex % GAME_CONSTANTS.PLAYER_COLORS.length].primary;
      const rankBadge = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`));
      return `
        <div class="roster-item" style="border-left-color: ${color}">
          <span style="font-weight:700;">${rankBadge} ${p.nickname} ${p.isBot ? '[BOT]' : ''}</span>
          <span style="font-weight:900;color:${color}">${p.score} PTS</span>
        </div>
      `;
    }).join('');

    this.btnRematch.style.display = this.network.getIsHost() ? 'block' : 'none';
  }

  private startInputStreaming(): void {
    if (this.inputSendInterval) return;
    this.inputSendInterval = window.setInterval(() => {
      if (this.currentPhase === 'ACTIVE' || this.currentPhase === 'COUNTDOWN') {
        const input = this.input.getPlayerInput();
        this.network.sendInput(input);
      }
    }, GAME_CONSTANTS.TICK_INTERVAL_MS);
  }

  private stopInputStreaming(): void {
    if (this.inputSendInterval) {
      clearInterval(this.inputSendInterval);
      this.inputSendInterval = null;
    }
  }

  private gameLoop(_ts: number): void {
    this.renderer.render(this.network.getLocalPlayerId());
    requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  private getNickname(): string {
    const val = (this.inputNickname.value || '').trim() || `Pilot-${Math.floor(Math.random() * 900 + 100)}`;
    localStorage.setItem('neon_orbit_nickname', val);
    return val;
  }

  private showToast(msg: string): void {
    this.errorToast.textContent = msg;
    this.errorToast.classList.remove('hidden');
    setTimeout(() => {
      this.errorToast.classList.add('hidden');
    }, 3200);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
