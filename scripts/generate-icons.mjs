/**
 * 由 public/icon.svg 生成各尺寸 PNG 图标（favicon / apple-touch-icon / PWA）。
 * 用本机 Chrome 渲染，避免引入图像处理依赖：node scripts/generate-icons.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = await readFile(join(root, 'public/icon.svg'), 'utf8')

const TARGETS = [
  { file: 'favicon-16.png', size: 16 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-48.png', size: 48 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
]

const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const { file, size } of TARGETS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">
         <div style="width:${size}px;height:${size}px">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</div>
       </body></html>`,
      { waitUntil: 'load' },
    )
    const png = await page.locator('svg').screenshot({ omitBackground: true })
    await writeFile(join(root, 'public', file), png)
    await page.close()
    console.log(`public/${file} (${size}×${size}, ${png.length} bytes)`)
  }
} finally {
  await browser.close()
}
