/**
 * 打包可分发的成品：dist/ + 启动器 + 服务脚本 + 说明 + LICENSE
 * 输出 rungcraft-<version>.zip 到仓库根目录（该文件不进版本库）。
 *
 *   npm run package            构建后打包
 *   npm run package -- --skip-build   跳过构建，直接打包现有 dist/
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skipBuild = process.argv.includes('--skip-build')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const zipPath = join(root, `${pkg.name}-${pkg.version}.zip`)

if (!skipBuild) {
  console.log('构建中…')
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (build.status !== 0) {
    console.error('构建失败，已中止打包。')
    process.exit(1)
  }
}

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('找不到 dist/index.html，请先运行 npm run build。')
  process.exit(1)
}

const stage = await mkdtemp(join(tmpdir(), 'rungcraft-package-'))
try {
  await cp(join(root, 'dist'), join(stage, 'dist'), { recursive: true })
  await mkdir(join(stage, 'scripts'), { recursive: true })
  await cp(join(root, 'scripts/serve.mjs'), join(stage, 'scripts/serve.mjs'))
  await cp(join(root, 'LICENSE'), join(stage, 'LICENSE'))
  for (const file of ['start-rungcraft.command', 'start-rungcraft.bat']) {
    await cp(join(root, file), join(stage, file))
  }
  await writeFile(join(stage, 'HOW-TO-RUN.txt'), howToRun(pkg.version), 'utf8')

  if (existsSync(zipPath)) await rm(zipPath)
  createZip(stage)

  const { size } = await stat(zipPath)
  console.log('')
  console.log(`已生成 ${zipPath}`)
  console.log(`大小 ${(size / 1024).toFixed(0)} KB（解压后只需 Node.js 20+，无需 npm install）`)
} finally {
  await rm(stage, { recursive: true, force: true })
}

function createZip(cwd) {
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${cwd}\\*' -DestinationPath '${zipPath}' -Force`,
    ])
    return
  }
  try {
    execFileSync('zip', ['-qr', zipPath, '.'], { cwd })
  } catch (error) {
    console.error(`调用 zip 失败：${error.message}`)
    console.error('请确认系统已安装 zip 命令。')
    process.exit(1)
  }
}

function howToRun(version) {
  return `RungCraft · 梯形图编辑器与仿真器 ${version}

如何运行
--------
1. 安装 Node.js 20 或更高版本：https://nodejs.org/
2. macOS 双击 start-rungcraft.command；Windows 双击 start-rungcraft.bat
   （命令行方式：node scripts/serve.mjs）
3. 浏览器会自动打开 http://127.0.0.1:4173/

说明
----
- 不需要联网，不上传任何数据；工程保存在浏览器本地存储（IndexedDB）中。
- 请通过上面的启动器打开，不要直接双击 dist/index.html：
  浏览器禁止 file:// 页面使用 Web Worker 与 IndexedDB，
  而仿真引擎跑在 Worker 里、自动保存依赖 IndexedDB。
- 端口被占用时会自动顺延到下一个可用端口，以终端提示的地址为准。
- 换浏览器或清除浏览器数据前，请先用界面上的“导出”保存 .ladproj.json 工程文件。
- 许可证：MIT，见 LICENSE。
`
}
