/**
 * RungCraft 本地启动器：用 Node 内置 http 服务 dist/ 并自动打开浏览器。
 * 不依赖任何第三方包，也不上传任何数据。
 *
 *   node scripts/serve.mjs [--port 4173] [--no-open] [--force]
 *
 * 如果该端口上已经有一个 RungCraft 在运行，就直接打开浏览器并退出，
 * 不会重复起第二个服务（一键启动器重复双击时很有用）。
 *
 * 为什么不用 file:// 直接打开 index.html：
 * 浏览器禁止 file:// 页面创建 Web Worker 和使用 IndexedDB，
 * 而仿真引擎跑在 Worker 里、工程存在 IndexedDB 里，所以必须经由 http:// 打开。
 */
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const args = process.argv.slice(2)
const noOpen = args.includes('--no-open')
const force = args.includes('--force')
const portArgIndex = args.indexOf('--port')
const basePort = portArgIndex >= 0 ? Number(args[portArgIndex + 1]) : 4173

if (!Number.isInteger(basePort) || basePort <= 0 || basePort > 65535) {
  console.error('端口参数不合法：--port 需要 1-65535 的整数')
  process.exit(1)
}

// 已经在运行就直接打开浏览器，避免重复双击起出第二个服务。
if (!force && (await isRungCraftRunning(basePort))) {
  const url = `http://127.0.0.1:${basePort}/`
  console.log(`RungCraft 已经在运行：${url}`)
  if (!noOpen) openBrowser(url)
  process.exit(0)
}

try {
  await access(join(dist, 'index.html'), constants.R_OK)
} catch {
  console.error('还没有构建产物：找不到 dist/index.html')
  console.error('请先运行：npm run build      或      npm run app（构建并启动）')
  process.exit(1)
}

/** 探测端口上是否已经是 RungCraft（用页面标题做标记）。 */
async function isRungCraftRunning(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })
    if (!response.ok) return false
    const html = (await response.text()).slice(0, 4096)
    return html.includes('RungCraft')
  } catch {
    return false
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

/** 解析请求路径；拒绝越出 dist 的路径。 */
function resolvePath(urlPath) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname)
  } catch {
    return undefined
  }
  const target = normalize(join(dist, pathname))
  if (target !== dist && !target.startsWith(dist + sep)) return undefined
  return target
}

async function findFile(pathname) {
  const target = resolvePath(pathname)
  if (!target) return undefined
  try {
    const info = await stat(target)
    if (info.isFile()) return target
    if (info.isDirectory()) {
      const index = join(target, 'index.html')
      const indexInfo = await stat(index).catch(() => undefined)
      if (indexInfo?.isFile()) return index
    }
  } catch {
    // 交给 SPA 回退处理
  }
  // 没有扩展名的路径回退到 index.html（前端路由/刷新）
  if (!extname(pathname)) {
    const index = join(dist, 'index.html')
    const indexInfo = await stat(index).catch(() => undefined)
    if (indexInfo?.isFile()) return index
  }
  return undefined
}

const server = createServer(async (req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0]
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed')
    return
  }
  const file = await findFile(urlPath)
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found')
    return
  }
  const ext = extname(file).toLowerCase()
  const immutable = file.includes(`${sep}assets${sep}`) && ext !== '.html'
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).on('error', () => res.destroy()).pipe(res)
})

function listen(port, attemptsLeft) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`端口 ${port} 已被占用，尝试 ${port + 1} …`)
      listen(port + 1, attemptsLeft - 1)
      return
    }
    console.error(`启动失败：${error.message}`)
    process.exit(1)
  })
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`
    console.log('')
    console.log('  RungCraft 已启动')
    console.log(`  ${url}`)
    console.log('')
    console.log('  按 Ctrl+C 停止。工程数据保存在这个浏览器的本地存储中。')
    console.log('')
    if (!noOpen) openBrowser(url)
  })
}

function openBrowser(url) {
  const platform = process.platform
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const commandArgs = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, commandArgs, { stdio: 'ignore', detached: true })
  child.on('error', () => {
    console.log('无法自动打开浏览器，请手动访问上面的地址。')
  })
  child.unref()
}

listen(basePort, 10)

process.on('SIGINT', () => {
  console.log('\n已停止。')
  process.exit(0)
})
