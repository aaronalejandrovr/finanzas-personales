@echo off
title Finanzas Personales
cd /d "%~dp0"

echo.
echo  ============================================
echo   Iniciando Finanzas Personales...
echo  ============================================
echo.

:: Iniciar el servidor en segundo plano
start "" /B node server.js

:: Esperar 2 segundos a que el servidor arranque
timeout /t 2 /nobreak > nul

:: Abrir el navegador
start "" "http://localhost:3000"

echo  Servidor activo en http://localhost:3000
echo  Cierra esta ventana para detener el servidor.
echo.

:: Mantener la ventana abierta (el servidor sigue corriendo)
node server.js
