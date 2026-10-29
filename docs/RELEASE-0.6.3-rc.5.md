# 0.6.3-rc.5 候选：把「可安装」变成发布前的门禁

## 安装

```text
github:Lafinger/dsh-collaboration-client#v0.6.3-rc.5
```

装完确认版本显示 `0.6.3-rc.5`。本插件不是官方插件，不自动更新；若仍显示旧版本，须先卸载旧插件再装。

> Release 页面（`…/releases/tag/v0.6.3-rc.5`）只用于查阅附件与说明，**不是**安装入口。安装器只接受包名、git 仓库地址或 tarball 地址，填网页地址会报 `a URL must point at a git repository or a tarball`。

## 本版没有改动运行时代码

`src/` 未改动，协议不变（`collaboration 3` / `humanAuthorization 2`）。本版只修 CI 与文档：

- 让 GitHub 安装验证真正可用，并在发布前执行；
- 让文档里的固定安装源不再漂移。

**因此不需要为此升级已安装的客户端。** 已装 `0.6.3-rc.4` 的成员可继续使用；本版的价值在于防止以后的发行版发出去却装不上。

## 修复的问题

### 1. `install:check` 在任何机器上都无法通过

`scripts/check-github-install.mjs` 有两处独立缺陷：

**没有隔离本机配置。** 成员配置与 HTTPS-MVP 连接都从用户主目录解析。已配置过客户端的机器上，挂载结果为 `configured`（实测 `source: https-mvp`，指向本机 `https-mvp/service.json`），于是「干净安装应为 `configuration-required`」的断言必然失败——与发布产物无关。

**断言本身不可达。** 原断言读 `collaborationMemberStatus.state`，但该服务只在连接变更回调里被赋值（`member-plugin.mjs` 的 `changed()` → `ctx.set`），因此未配置的干净安装里它恒为 `{}`，`state` 是 `undefined`。也就是说即便在全新环境，这条断言也不可能等于 `configuration-required`。

净效果是：配置过的机器报 `configured` 失败，干净机器报 `undefined` 失败，两边都红。

### 2. 文档里的固定安装源已经过期多个版本

修订前各文档指向三个不同版本：README 一处 `#v0.6.2-rc.1`、另一处 `#v0.6.1-rc.1`，`docs/RELEASE.md` 三处 `#v0.6.2-rc.1`，而包版本是 `0.6.3-rc.4`。照文档输入会装到旧版。

## 修复方式

### 检查脚本

1. 挂载冒烟测试改在**临时 HOME** 中运行，并清空 `DSH_COLLABORATION_CLIENT_CONFIG`、`DSH_COLLABORATION_PACKAGE_ROOT`、`DSH_MENU_DIAGNOSIS_ARTIFACTS`、`COLLABORATION_OFFICIAL_NODE_MODULES`——这正是本仓库 `scripts/check.mjs` 早已对每个离线检查使用的同一套隔离手法，`check-github-install.mjs` 只是漏用了。
2. 断言改读 `collaborationMemberConnection.resolved.state`，即设置界面实际读取的字段，它始终携带状态。同时断言：连接服务存在（设置界面可用）、未创建客户端、解析出的 `configPath` 落在临时 HOME 内（证明隔离生效）、`collaborationMemberClient` 未注册、`collaboration-remote` 路由未注册。

### CI

新增 `github-install` 作业，只在推送 `v*` 标签时运行，按成员方式执行：

```sh
pnpm run install:check "github:Lafinger/dsh-collaboration-client#<推送的标签>"
```

并让发布作业 `needs: [package, github-install]`——安装验证不通过就**不会**发布 Release。

### 文档

- README 与 `docs/RELEASE.md` 的固定安装源统一到本版本。
- 新增 `test/docs-install-source.test.mjs`：校验 README 安装章节与 `docs/RELEASE.md` 的固定安装源等于 `package.version`，且当前版本的 `docs/RELEASE-<版本>.md` 必须存在并写明该安装源。忘记同步会直接让门禁失败。
- 历史 `docs/RELEASE-<旧版本>.md` 保持原样，作为当时发行内容的时间戳记录，不回改。

## 验证

- 全量门禁 `pnpm run check`：**exit 0**
- `install:check` 针对 `#v0.6.3-rc.4` 实测通过（`EXIT: 0`，`isolatedMount: PASS`，`configurationSourceIsolated: true`）
- 同一命令在隔离前曾在本机失败（`configured`），隔离与断言修正后通过，说明修复针对的是真实原因

## 残留风险与边界

- 本版**没有**在真实 DSH GUI 里安装验证，也没有真人业务验收；结论来自隔离 CLI 与 CI。
- 标签 CI 的 `install:check` 只证明该标签可被 pnpm 从 GitHub 取出、挂载、并在无配置时正确报告待配置；不等同于扫码登录、项目选择或附件业务通过。
- 该作业需要网络，且会拉取 `@deepseek-ai/*` peer 依赖，因此比离线检查慢；失败时应先看是否为网络或上游 registry 问题，再判断是否为包缺陷。
