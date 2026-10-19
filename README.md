# RungCraft · 梯形图（LAD）编辑器 + 仿真器

**RungCraft** 是一个基于浏览器的、参考西门子 TIA Portal 风格的梯形图编程与仿真工具。纯前端运行，工程保存在浏览器 IndexedDB，可导入/导出 JSON 工程文件，无需后端。

> 名字取自梯形图的基本单位 *rung*（梯级）。图标是一段梯级：两条电源轨、一个常开触点，以及一条表示能流接通的绿色梯级。

## 当前能力

- **工程与变量**：工程树、PLC 变量表、PLC 数据类型（UDT）、OB1 主程序块、多网络、监视表、交叉引用。
- **梯形图编辑**：常开/常闭/边沿触点、线圈/取反/置位/复位/边沿线圈、串联/并联分支、多线圈；从指令目录拖放或点击插入；内联操作数编辑（标签/块变量/DB 字段/结构体数组元素自动补全、地址解析、字面量）；复制/粘贴/删除；撤销/重做。
- **程序结构**：数据块（基础类型/一维数组/结构体嵌套/结构体数组/UDT）、FC/FB 块与接口编辑、块调用与参数绑定、FB 实例数据块、多重实例（FB 静态变量作为另一个 FB 的实例）、静态变量与调用帧隔离、递归检测、交叉引用。
- **PLC 数据类型（UDT）**：具名可复用类型，可在数据块字段、块接口（含 FB 静态变量）与其它 UDT 中按名称引用；支持 UDT 数组与嵌套 UDT，修改定义后所有引用处同步生效；块内可用 `#变量.字段` 访问 UDT/结构体成员；重名、未知引用与循环引用在编译期报诊断。
- **仿真**：Web Worker 扫描周期引擎，支持运行/暂停/单步/停止/复位、扫描周期与倍速、实时能流染色、定时器/计数器 Q/ET/CV 在线显示、I/O 面板、监视表读写、I/Q 强制、实例监视（FB 实例 DB 字段在线值）。
- **指令**：位逻辑、TON/TOF/TP、CTU/CTD/CTUD、比较、数学、移动、转换、移位、字逻辑、程序控制（JMP/LABEL，编译期校验重复标签与未知跳转目标）。
- **交互**：元素右键菜单（插入/切换触点线圈类型/复制/粘贴/删除）、**拖动已有元素重新排序**（拖到元素左/右半边插到前/后，Shift 变并联分支，拖到导线或空白处调整位置）、方向键在元素间移动选择、插入模式横幅与 Esc 取消、诊断面板计数与筛选并支持点击定位、全局提示（toast）与确认对话框、未保存改动离开页面提示。
- **快捷键**：Ctrl+Z / Ctrl+Y 撤销重做，Ctrl+S 立即保存，Ctrl+C / Ctrl+X / Ctrl+V 复制剪切粘贴，Delete 删除，方向键移动选择，Esc 取消插入/编辑，F5 编译并运行，Shift+F5 停止。
- **性能**：能流与变量值按元素/按行订阅（只有真正变化的元素重渲染），布局一次测量（避免 O(n²)）且导线 key 稳定，面板派生数据记忆化，监视表/I/O 面板/实例监视使用窗口化（只渲染视口内的行）。
- **持久化**：IndexedDB 自动保存与恢复快照，`.ladproj.json` 导入导出，Zod schema 校验与版本迁移（v1→v2 自动补齐 UDT 列表）。
- **内置示例**：电机启停、交通灯（TON + CTU + 比较）、传送带计数（上升沿 + CTU + 比较）、水箱控制（FB + DB + UDT + 模拟量比较）；首次启动有引导页，可选择新建空白工程或从示例开始。

## 运行成品（无需开发环境）

最省事的方式是双击一键启动程序：

| 平台 | 双击这个 | 说明 |
| --- | --- | --- |
| macOS | `RungCraft.app` | 无终端窗口，自动打开浏览器；在 Dock 上退出应用即停止服务 |
| Windows | `start-rungcraft.bat` | 保留一个命令行窗口显示地址，Ctrl+C 停止 |
| macOS / Linux | `start-rungcraft.command` | 终端方式，Ctrl+C 停止 |

`RungCraft.app` 由 `npm run launcher` 生成（只用 macOS 自带的 `sips` / `iconutil`，不依赖 `node_modules`，刚 clone 下来也能生成）。

命令行方式：

```bash
npm install          # 只需第一次
npm run app          # 构建并启动（等价于 npm run build && npm start）
npm start            # 已有构建产物时只启动服务器
```

启动器做的事：用 Node 内置 http 服务 `dist/`，只监听 `127.0.0.1`，不上传任何数据；缺少构建产物时自动构建；找不到 Node 时弹出提示（应用包内没有终端可看日志）；**重复双击不会起第二个服务**——检测到已在运行就直接打开浏览器。

> 为什么不能直接双击 `dist/index.html`：浏览器禁止 `file://` 页面创建 Web Worker 和使用 IndexedDB，而仿真引擎跑在 Worker 里、工程保存在 IndexedDB 里，所以必须通过 `http://` 打开。启动器就是为了解决这一点。

**分发给其他人**：`npm run package` 会生成 `rungcraft-<版本>.zip`（`dist/` + 启动器 + `RungCraft.app` + 说明 + LICENSE，约 950 KB），对方装好 Node.js 20+ 后解压双击即可，**不需要 npm install**。从网络下载来的 `.app` / `.command` 首次打开时 macOS 可能提示"无法验证开发者"，右键 → 打开 一次即可。

## 发布版本（GitHub Releases）

版本发布由 `.github/workflows/release.yml` 自动完成：推送 `v*` 标签后，GitHub Actions 会在 macOS runner 上执行 lint、单元测试与构建，生成 `RungCraft.app`，再用 `npm run package` 打出 `rungcraft-<版本>.zip`，生成 SHA-256 校验和并发布到 Release（附自动生成的更新说明）。

```bash
# 1. 先把 package.json 的 version 改成新版本并提交
# 2. 打标签并推送（tag 必须与 package.json 版本一致，如 v0.2.0）
git tag v0.2.0
git push origin main --tags
```

也可以在 GitHub 的 **Actions → Release → Run workflow** 手动发布：tag 留空则使用 `v<package.json 版本>`；填写 `v0.2.0-rc.1` 这类带 `-` 的 tag 会自动标记为预发布，勾选 `draft` 则先创建草稿。重复运行会覆盖同名 Release 的附件。

## 开发

```bash
npm install
npm run dev          # 启动开发服务器
npm run test:run     # 单元测试（Vitest）
npm run test:e2e     # 端到端测试（Playwright，使用本机 Chrome）
npm run build        # 类型检查 + 生产构建
npm run lint         # oxlint
npm run typecheck    # 仅类型检查
npm run icons        # 由 public/icon.svg 重新生成各尺寸 PNG 图标（需要本机 Chrome）
npm run app          # 构建并以本地服务器运行成品
```

性能基线（`src/perf/stress.test.ts`，本机 Node）：500 个网络 / 约 5500 个元素编译 7 ms、10 次扫描 6 ms（每次扫描远低于 20 ms 周期）；单个 2000 元素网络布局 1 ms。测试用例设置了宽松预算，用于拦住量级退化。

## 多机同步与目录瘦身

版本库里只有源码。下面这些都不会进版本库，删掉随时可以重新生成：

| 内容 | 体积 | 重新生成 |
| --- | --- | --- |
| `node_modules/` | 约 220 MB | `npm ci`（走本机 npm 缓存，通常几秒） |
| `dist/` | 约 760 KB | `npm run build` |
| `rungcraft-<版本>.zip` | 约 280 KB | `npm run package` |
| `test-results/`、`playwright-report/` | 测试产物 | 跑测试时自动生成 |
| `RungCraft.app/` | 700 KB | `npm run launcher` |

新电脑上开始开发：

```bash
git clone <仓库地址> rungcraft
cd rungcraft
npm ci               # 等价于 npm run setup
npm run dev
```

几点说明：

- **不需要下载浏览器**：端到端测试直接用本机安装的 Chrome（`playwright.config.ts` 中的 `channel: 'chrome'`），不会往 `~/Library/Caches/ms-playwright` 装几百 MB 的 Chromium。
- **建议用 git 同步，不要用云盘**：`node_modules/` 有十几万个小文件，iCloud/Dropbox 这类同步会非常慢且容易产生冲突副本，`.git/` 同样不适合云盘。如果一定要用云盘，至少要排除 `node_modules/`、`dist/`、`.git/`。
- 干净工作区约 **2 MB**（其中 `.git` 占 836 KB），源码本身约 1 MB。

## 目录结构

```text
public/           图标（icon.svg 为源文件，PNG 由 npm run icons 生成）
scripts/          构建辅助脚本（图标生成）
src/domain/       工程/梯形图类型、地址解析、指令目录、树操作、示例与压力工程
src/store/        项目 store（Immer 补丁式撤销/重做）、UI、仿真、通知
src/compiler/     符号解析、内存布局、能流树编译与诊断
src/runtime/      大端内存、扫描引擎、定时器/计数器
src/workers/      仿真 Worker、协议、主线程客户端
src/components/   通用控件（对话框、虚拟表格、提示、输入框）
src/features/     工程树、变量表、数据类型、梯形图编辑器、监视/IO/诊断、仿真工具栏
src/persistence/  IndexedDB、Zod schema、导入导出
src/perf/         性能基线用例
e2e/              Playwright 用例
```

## 路线图

- M0–M2（已完成）：工程底座、LAD 编辑器、核心仿真（位逻辑/定时器/计数器/监控）。
- M3（已完成）：数据块（基础类型/一维数组/结构体/结构体数组）、具名 UDT（含 UDT 数组与嵌套、块内字段访问）、FC/FB 与实例 DB、块调用与参数绑定、多重实例 FB、交叉引用、指令运行状态在线显示、JMP/LABEL、实例监视面板。
- 打磨（已完成）：右键菜单、快捷键、拖动重排、诊断定位与筛选、提示与确认、中文输入法、渲染性能与长列表窗口化、4 个示例工程 + 启动引导页。
- M4（待开始）：简化 HMI 画面与配方。

详细规划见仓库外部的实施计划文档（`~/.claude/plans/`）。
