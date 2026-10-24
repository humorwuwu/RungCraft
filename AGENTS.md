# AGENTS.md — RungCraft

> 工作区总规约在上一级 [`AGENTS.md`](../AGENTS.md)（本机 `ongoing/`；仓库单独克隆时没有它，以本文件为准）。新建同类目录前先读总规约。总规约与本文件冲突时，以本文件更具体的那条为准，但不得放松总规约的红线。


梯形图编辑器与仿真器。React / TypeScript / Vite。远端 `github.com/humorwuwu/RungCraft`。

## 目录（不要发明新名字）

| 路径 | 角色 | 阶段结束后 |
|---|---|---|
| `src/`、`e2e/`、`public/`、`scripts/` | 源码与脚本 | 保留 |
| `dist/` | **Vite 的网页包**，启动器 `scripts/serve.mjs` 服务它。这是工具目录，不是多平台发行目录 | 可删，`npm run build` 几秒恢复。不要把 zip 放进来 |
| `release/macos/` | **可分发的成品** `rungcraft-<version>.zip` | 保留最新一份。解压副本不要留在 `release/` 根上 |
| `node_modules/` | 开发依赖 | 默认保留。不要为了「清爽」删掉，除非用户明确要求 |
| `coverage/`、`test-results/`、`playwright-report/` | 测试报告 | 删除 |
| 仓库根的 `RungCraft.app`、`rungcraft-*.zip` | 旧的散落产物 | 不要再生成。app 只应出现在 zip 里 |

平台目录只允许 `macos`、`windows`、`linux`、`ios`、`android`、`web`。这个 zip 是「网页包 + macOS 启动器」，所以放在 `release/macos/`，文件名保持 `rungcraft-<version>.zip`（没有架构后缀，验收和 CI 按这个名字找）。

不要新建 `out/`、`artifacts/`、`publish/`。

## 阶段清理

`npm run package` 成功之后运行 `bash scripts/clean.sh`。它删 Vite `dist/`、测试报告、仓库根的散落 `.app` / zip，以及 `release/` 根上的解压副本。保留 `release/macos/*.zip` 和 `node_modules/`。

## 命令

```sh
npm ci
npm test
npm run build          # -> dist/
npm run package        # -> release/macos/rungcraft-<version>.zip
npm start              # 服务 dist/；没有 dist/ 时先 npm run build
```
