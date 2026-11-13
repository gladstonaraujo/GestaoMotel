@echo off
rem Abre o painel de publicacao no navegador. De dois cliques neste arquivo.
title Painel de publicacao - Gestao Motel
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

if not exist "node_modules\ssh2" (
  echo Instalando as dependencias do painel ^(so na primeira vez^)...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)

node servidor.js
pause
