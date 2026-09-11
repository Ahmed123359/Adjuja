@echo off
title OffrIA
cd /d "%~dp0"

echo.
echo  ========================================
echo    OffrIA - Demarrage en cours...
echo  ========================================
echo.

REM Ouvre le navigateur apres 10 secondes (le temps que Docker demarre)
start /B cmd /c "timeout /t 10 /nobreak > nul && start http://localhost:8000"

REM Lance tous les containers (fermer cette fenetre = eteindre OffrIA)
docker compose up
