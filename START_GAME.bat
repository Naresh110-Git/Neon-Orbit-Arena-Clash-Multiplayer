@echo off
title Neon Orbit Multiplayer Server
echo ==================================================
echo Starting Neon Orbit Multiplayer Game...
echo ==================================================
start http://localhost:3001
node dist/server/index.js
pause
