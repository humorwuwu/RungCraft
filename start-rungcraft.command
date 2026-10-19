#!/bin/bash
# RungCraft 启动器（macOS：双击运行）
cd "$(dirname "$0")" || exit 1

# 双击运行时 PATH 很精简，补上常见的 Node 安装位置（含 nvm）。
if ! command -v node >/dev/null 2>&1; then
  for dir in "$HOME/.nvm/versions/node"/*/bin /opt/homebrew/bin /usr/local/bin; do
    if [ -x "$dir/node" ]; then
      PATH="$dir:$PATH"
      break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "找不到 Node.js。请先安装 Node.js 20 或更高版本：https://nodejs.org/"
  echo "按任意键关闭…"
  read -n 1 -s
  exit 1
fi

# 没有构建产物时自动构建（需要先 npm install）。
if [ ! -f dist/index.html ]; then
  echo "首次运行：正在构建，请稍候…"
  if ! npm run build; then
    echo "构建失败。请先在终端执行 npm install 后重试。"
    echo "按任意键关闭…"
    read -n 1 -s
    exit 1
  fi
fi

node scripts/serve.mjs "$@"
status=$?
if [ $status -ne 0 ]; then
  echo "按任意键关闭…"
  read -n 1 -s
fi
