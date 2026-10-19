@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js。请先安装 Node.js 20 或更高版本：https://nodejs.org/
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo 首次运行：正在构建，请稍候…
  call npm run build
  if errorlevel 1 (
    echo 构建失败。请先在命令行执行 npm install 后重试。
    pause
    exit /b 1
  )
)

set SERVER=scripts\serve.mjs
if not exist "%SERVER%" set SERVER=serve.mjs
if not exist "%SERVER%" (
  echo 找不到启动脚本（scripts\serve.mjs 或 serve.mjs），请确认文件完整。
  pause
  exit /b 1
)

node "%SERVER%" %*
pause
