@echo off
rem Starts Saga Forge on Windows. Double-click this file, or run it from cmd or PowerShell.
rem   run.cmd          dev mode (hot reload)
rem   run.cmd start    build, then run the built app
setlocal
cd /d "%~dp0"

rem Keep npm and Electron downloads inside the workspace (or this folder), not the user profile.
set "CACHE=%~dp0.cache"
if exist "%~dp0..\..\.cache\" set "CACHE=%~dp0..\..\.cache"
set "npm_config_cache=%CACHE%\npm"
set "electron_config_cache=%CACHE%\electron"

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install --no-fund --no-audit || goto :fail
)
if not exist node_modules\electron\dist (
  echo Downloading Electron...
  node node_modules\electron\install.js || goto :fail
)

if /i "%~1"=="start" (
  call npm.cmd run build || goto :fail
  call npm.cmd start
) else (
  call npm.cmd run dev
)
exit /b %errorlevel%

:fail
echo.
echo Something went wrong. See the messages above.
pause
exit /b 1
