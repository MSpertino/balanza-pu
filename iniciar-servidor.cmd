@echo off
title Servidor local - Balanza de formulacion
cd /d "%~dp0"
echo.
echo Iniciando servidor en http://localhost:3000
echo No cierres esta ventana mientras uses la balanza.
echo.
node server.js
echo.
echo El servidor se detuvo. Revisa el mensaje anterior.
pause
