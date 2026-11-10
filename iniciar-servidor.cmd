@echo off
setlocal
title Servidor local - Balanza de formulacion
cd /d "%~dp0"
if not defined PORT set PORT=3000
if not defined HOST set HOST=127.0.0.1
echo.
echo Iniciando servidor en http://%HOST%:%PORT%
echo No cierres esta ventana mientras uses la balanza.
echo Los registros se guardan en data\sessions.json.
echo.
node server.js
echo.
echo El servidor se detuvo. Revisa el mensaje anterior.
pause
