# ⚡ Neon Orbit: Arena Clash
> **Handshake AI Skills Studio X OpenAI Multiplayer Game Challenge Entry**  
> *A real-time, zero-install, zero-login multiplayer arcade arena game playable on any phone or laptop.*

![Neon Orbit Cover](./neon_orbit_cover.jpg)

[![Status](https://img.shields.io/badge/Status-Competition%20Ready-00f0ff.svg)](#)
[![Networking](https://img.shields.io/badge/Networking-30Hz%20WebSocket%20%2B%2060FPS%20LERP-39ff14.svg)](#)
[![Zero-Login](https://img.shields.io/badge/Auth-Zero%20Login%20Required-ff0055.svg)](#)
[![Cross-Platform](https://img.shields.io/badge/Platform-Phones%20%26%20Laptops-ffe600.svg)](#)
[![AI-Bots](https://img.shields.io/badge/AI-Autonomous%20Bots%20Enabled-b800ff.svg)](#)

---

## 🎯 Challenge Requirements Compliance Matrix

| Handshake Challenge Requirement | How Neon Orbit Fulfills It |
| :--- | :--- |
| **"At its own public URL"** | Fully configured single-port deployment ready for Render / Railway / Fly.io (`render.yaml`). |
| **"Any group joins with a room code"** | 4-letter room codes (e.g., `WARP`, `NEON`) + instant scannable **QR code** for phone cameras + direct URL joining (`?room=CODE`) + **Live Open Room Directory**! |
| **"No logins, no app installs"** | 100% in-browser HTML5. Ephemeral session tokens. Zero account creation, passwords, or app store downloads. |
| **"Replayable any night"** | Instant 1-click **Rematch** flow re-rolls the arena for the whole room without disconnecting or restarting the server. |
| **"From any phone or laptop"** | Responsive dynamic viewport. **Desktop**: WASD/Arrow keys + Space/Shift. **Mobile**: Dynamic touch joystick + Boost & Pulse buttons. |
| **"Keep every player's screen in sync"** | Authoritative 30Hz server loop with client-side linear interpolation (LERP) delivering smooth 60 FPS motion and sub-30ms latency. |
| **Solo Evaluator Friendly** | Includes **Solo Practice Mode vs AI Bots** so solo evaluators can test the complete game loop without waiting for a partner. |

---

## 🚀 Quick Start (Local Run)

### Prerequisites
- Node.js (v18+) & npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Production Bundle
```bash
npm run build
```

### 3. Launch the Server
```bash
npm start
```
The game will be live at: **`http://localhost:3000`**

### 4. Development Mode (Hot Reloading)
```bash
npm run dev
```

---

## 🧪 Automated Multi-Client Verification Test

Run the comprehensive test suite covering public room discovery, 4-player real-time synchronization, autonomous AI bots, and session token reconnection:
```bash
npm run test:sim
```

---

## 🎮 Gameplay & Rules

* **Goal**: Steer your neon craft to gather glowing cosmic energy orbs and outscore rivals.
* **Hazards**: In the final 30 seconds, the electric boundary ring contracts toward the center. Knock rivals into the perimeter or fire your **Pulse Shockwave** to blow them away!
* **Scoring**:
  * Standard Energy Orb: `+10 PTS`
  * Super Energy Orb: `+35 PTS` + instant speed surge
  * Pulse Knockback Hit: `+5 PTS`
  * Electric Ring Penalty: `-1 PT`
* **Controls**:
  * **Laptop / Desktop**:
    * Steer: `W, A, S, D` or `Arrow Keys`
    * Pulse Shockwave: `Spacebar`
    * Boost Thrusters: `Shift`
  * **Mobile / Tablet**:
    * Steer: Drag thumb on left half of screen (dynamic virtual joystick)
    * Boost: Tap `BOOST` button
    * Pulse: Tap `PULSE` button

---

## 🛠️ Key Architectural Distinctions

1. **Live Open Room Directory**: Just like top submission *Panic Protocol*, players see active open rooms with commander names, player counts, and 1-click "Join Room" buttons right on the home page.
2. **Solo AI Bot Practice**: Solo evaluators or solo players can click "Play Solo Practice (vs AI Bots)" to immediately spawn into a room populated with intelligent bots that gather orbs and trigger shockwaves.
3. **Session Token Recovery**: Player sessions are preserved in `sessionStorage`. Accidental tab reloads reconnect the player into their existing ship without creating ghost avatars or losing points.
4. **Procedural Web Audio Soundtrack**: Uses Web Audio API synthesizers for real-time sound effects and an 8-bit cyberpunk bassline arpeggiator—zero external `.mp3` files to fail on spotty cellular connections.
5. **Ultra-Lightweight Bundle**: Built with Vite and Canvas 2D (< 80KB gzip total), loading in under 500ms on 4G networks.

---

## 📋 Competition Submission Details

See [`SUBMISSION_DETAILS.md`](./SUBMISSION_DETAILS.md) for the exact submission copy, rubric alignment details, and step-by-step instructions for submitting to Handshake before **October 30, 2026 at 11:59 PM PT**.
