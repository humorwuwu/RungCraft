#!/usr/bin/env bash
# 阶段结束后清中间产物。保留 release/macos/*.zip 和 node_modules/。
#   bash scripts/clean.sh [--dry-run] [--deep]
set -euo pipefail
cd "$(dirname "$0")/.."
DRY=0
DEEP=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --deep) DEEP=1 ;;
    *) echo "未知参数：$arg" >&2; exit 2 ;;
  esac
done
remove() {
  [ -e "$1" ] || return 0
  echo "  $1"
  [ "$DRY" = "1" ] || rm -rf "$1"
}
echo "中间产物："
remove dist
remove coverage
remove test-results
remove playwright-report
remove blob-report
remove .playwright
remove RungCraft.app
# release/ 根上的解压副本；平台目录里的 zip 留下
if [ -d release ]; then
  for item in release/*; do
    [ -e "$item" ] || continue
    base=$(basename "$item")
    case "$base" in
      macos|windows|linux|ios|android|web) continue ;;
    esac
    remove "$item"
  done
fi
find . -name 'rungcraft-*.zip' -not -path './release/*' -print | while read -r f; do
  remove "$f"
done
if [ "$DEEP" = "1" ]; then
  echo "开发依赖："
  remove node_modules
fi
find . -name '.DS_Store' -not -path './.git/*' -delete 2>/dev/null || true
echo "保留：release/macos/、node_modules/（除非 --deep）"
