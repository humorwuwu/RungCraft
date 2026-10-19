/**
 * 生成一键启动的 macOS 应用包 RungCraft.app（双击即用，不弹终端窗口）。
 *
 *   npm run launcher
 *
 * 只用到 macOS 自带命令（sips / iconutil），不依赖 node_modules，
 * 所以刚 clone 下来、还没装依赖的机器也能生成。
 * Windows 用户请使用 start-rungcraft.bat。
 */
import { execFileSync } from 'node:child_process'
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const appName = 'RungCraft'
const appPath = join(root, `${appName}.app`)

if (process.platform !== 'darwin') {
  console.error('这个脚本用来生成 macOS 应用包，只能在 macOS 上运行。')
  console.error('Windows 请直接使用 start-rungcraft.bat；Linux 使用 ./start-rungcraft.command。')
  process.exit(1)
}

if (!existsSync(join(root, 'public/icon-512.png'))) {
  console.error('找不到 public/icon-512.png，请先运行 npm run icons 生成图标。')
  process.exit(1)
}

await rm(appPath, { recursive: true, force: true })
const contents = join(appPath, 'Contents')
await mkdir(join(contents, 'MacOS'), { recursive: true })
await mkdir(join(contents, 'Resources'), { recursive: true })

await writeFile(join(contents, 'Info.plist'), infoPlist(pkg.version), 'utf8')
await writeFile(join(contents, 'PkgInfo'), 'APPL????', 'utf8')

const launcher = join(contents, 'MacOS', appName)
await writeFile(launcher, launcherScript(appName), 'utf8')
await chmod(launcher, 0o755)

await makeIcon(join(contents, 'Resources', `${appName}.icns`))

console.log('')
console.log(`已生成 ${appPath}`)
console.log('')
console.log('双击 RungCraft.app 即可启动：会自动打开浏览器，无需终端操作。')
console.log('服务随应用退出而停止——在 Dock 上退出 RungCraft 即可。')

/**
 * 应用图标：用 macOS 自带的 sips 生成 iconset 再用 iconutil 打包成 icns。
 * 除 1024（512@2x）之外都是从 512 缩小的，因此清晰度足够。
 */
async function makeIcon(icnsPath) {
  const source = join(root, 'public/icon-512.png')
  const iconset = join(root, `${appName}.iconset`)
  await rm(iconset, { recursive: true, force: true })
  await mkdir(iconset, { recursive: true })

  const variants = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ]

  try {
    for (const [size, name] of variants) {
      execFileSync('sips', ['-z', String(size), String(size), source, '--out', join(iconset, name)], { stdio: 'ignore' })
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icnsPath], { stdio: 'ignore' })
  } finally {
    await rm(iconset, { recursive: true, force: true })
  }
}

function infoPlist(version) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${appName}</string>
  <key>CFBundleDisplayName</key><string>${appName}</string>
  <key>CFBundleIdentifier</key><string>dev.rungcraft.launcher</string>
  <key>CFBundleExecutable</key><string>${appName}</string>
  <key>CFBundleIconFile</key><string>${appName}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`
}

/**
 * 应用内的启动脚本。要点：
 * - 双击启动时环境变量极简，需要自己把 nvm / Homebrew 的 Node 找出来；
 * - 出错时用系统对话框提示（没有终端可看）；
 * - 结尾用 exec 让 node 接管进程，这样在 Dock 上退出应用就能停掉服务。
 */
function launcherScript(name) {
  return `#!/bin/bash
set -u

# Contents/MacOS -> Contents -> RungCraft.app -> 项目根目录（三层）
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

alert() {
  /usr/bin/osascript -e "display dialog \\"$1\\" with title \\"${name}\\" buttons {\\"好\\"} default button 1 with icon stop" >/dev/null 2>&1
}

# 双击启动的应用拿不到登录 shell 的 PATH，这里补上常见的 Node 安装位置。
if ! command -v node >/dev/null 2>&1; then
  for dir in "$HOME/.nvm/versions/node"/*/bin "$HOME/.volta/bin" /opt/homebrew/bin /usr/local/bin; do
    if [ -x "$dir/node" ]; then
      PATH="$dir:$PATH"
      break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  alert "找不到 Node.js。请先安装 Node.js 20 或更高版本（https://nodejs.org/），然后重新打开本应用。"
  exit 1
fi

cd "$ROOT" || {
  alert "找不到项目目录：$ROOT"
  exit 1
}

# 兼容两种目录布局：仓库里的 scripts/serve.mjs，或与应用同级的 serve.mjs。
SERVER="scripts/serve.mjs"
[ -f "$SERVER" ] || SERVER="serve.mjs"
if [ ! -f "$SERVER" ]; then
  alert "找不到启动脚本（scripts/serve.mjs 或 serve.mjs），请确认应用已放在项目目录中。"
  exit 1
fi

# 没有构建产物时先构建（需要 npm；依赖未安装时提示用户）。
if [ ! -f "dist/index.html" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    alert "还没有构建产物，且找不到 npm。请在项目目录执行 npm ci 与 npm run build 后重试。"
    exit 1
  fi
  /usr/bin/osascript -e 'display notification "首次运行，正在构建，请稍候…" with title "${name}"' >/dev/null 2>&1
  if ! npm run build >/tmp/rungcraft-build.log 2>&1; then
    alert "构建失败。请查看 /tmp/rungcraft-build.log，并确认已执行过 npm ci。"
    exit 1
  fi
fi

exec node "$SERVER" "$@"
`
}
