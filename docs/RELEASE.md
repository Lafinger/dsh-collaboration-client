# GitHub 构建、发布与安装

## 范围

只向 GitHub 发布，不向 npm registry 或 DSH 插件市场发布。保留 `private:true` 防止 npm 发布，代码采用 [MIT 许可证](../LICENSE)；没有 NPM_TOKEN、OIDC npm 发布、市场投稿或登记步骤。官方依赖下载可能访问 npm，这与发布本插件到 npm 是两回事。

本插件的执行入口是仓库内的 `.mjs`，不需要 prepare/install/prepack 构建。`github:` 来源可直接取得 main/exports、bundle patch、配置模块和模板，不依赖工作区 build 输出。

## 自动触发

[工作流](../.github/workflows/release.yml)：

| 事件 | 行为 |
|---|---|
| Pull request | Linux + Windows 检查/测试；通过后打包并保存 Actions artifact |
| main 提交 | 同上，不创建 Release |
| workflow_dispatch | 手动检查/打包，不创建 Release |
| 推送 v* 标签 | 校验标签等于包版本且提交属于 main；再按成员方式安装该标签验证可安装性；全部通过后发布 GitHub Release |

Node24.21.0 / pnpm11.7.0固定；依赖冻结 lockfile且禁止 lifecycle scripts。双平台回归后只在Linux打包一份，Release下载同一已验证artifact，不重新构建。

构建仅 contents:read；只有tag发布job有contents:write。PR不使用pull_request_target，也不接收发布token。仓库自带的GitHub Actions token用于创建Release，通常不需要额外Secret。

## 安装入口

DSH 插件管理器输入：

```text
github:Lafinger/dsh-collaboration-client
```

这会安装默认分支代码，不自动选择最新 Release。安装统一使用固定版本：

```text
github:Lafinger/dsh-collaboration-client#v0.6.3-rc.6
```

隔离 CLI 验证示意：

```sh
dsh plugin --profile collaboration-compat-github add github:Lafinger/dsh-collaboration-client --ignore-scripts
dsh plugin --profile collaboration-compat-github-tag add github:Lafinger/dsh-collaboration-client#v0.6.3-rc.6 --ignore-scripts
```

还可在[Releases](https://github.com/Lafinger/dsh-collaboration-client/releases)下载 `.tgz`，核对 SHA256SUMS 后安装。main移到新提交不改变已固定的tag；版本tag/附件不得移动或覆盖。

安装／启用不表示已连接、已登录或已执行业务。当前MVP从协作服务设置可信HTTPS地址并由本人官方钉钉扫码；已有有效设备登录不为升级而退出或清理。见[本版配套范围与验收边界](RELEASE-0.6.2-rc.1.md)和[连接配置](INSTALL.md)；旧SSH接入说明仅为历史兼容，GUI、真实模型和业务验收不是CI自动发布的结论。

## 首次/后续发布

首次标签是 v0.1.2。后续：

1. 在[包配置](../package.json)升版，保持支持的DSH精确版本。
2. 更新必要文档；使用pnpm更新lockfile并执行check、pack/pack:check。README 与本文的固定安装源必须同步到新版本，并新增 `docs/RELEASE-<版本>.md` 写明该版本固定安装源；`test/docs-install-source.test.mjs` 会拦住忘记同步的提交。
3. 在唯一分支提交并创建PR，等待Ubuntu／Windows／Package三个required checks通过后普通合并，不admin bypass；再等待准确main提交的CI成功。
4. 创建带注释的版本tag，push tag：

```sh
git tag -a v0.6.3-rc.6 -m "Release v0.6.3-rc.6"
git push origin v0.6.3-rc.6
```

这里0.6.3-rc.6是本版示例，必须和package.version相同；若该tag已发布，后续须另升未用版本，不能重打或覆盖。不能只改标签不升包版本。带rc/beta等版本自动标prerelease，普通版本设为latest。

5. 检查GitHub Actions结果和Release附件。标签CI里的 `install:check` 已按成员方式安装该标签并挂载成功，发布前即确认可安装；发布后再在独立环境按同一固定tag复核一次。

## 产物与失败恢复

[产物脚本](../scripts/release-assets.mjs)生成版本化tgz、SHA256SUMS和release.json（版本、commit、hash、DSH支持版本与工具版本；不包含凭据）。

[发布脚本](../scripts/publish-github-release.mjs)先创建draft，上传经过核验的三份附件，成功后公开。重跑不会clobber；已有附件逐个读取并检查hash，内容不一致停止并要求升版。公开发行版缺附件也不静默修改。失败draft保留供排查；在网页删除/修复draft前需核实原因，不强制重打tag。

若GitHub启用了Immutable Releases，以上draft-to-published流程也兼容；本轮不改变仓库保护规则。建议后续为main和v*标签配置规则，限制谁可发布。

## 独立验证与边界

```sh
pnpm run check
pnpm pack --out .dsh/dsh-collaboration-client.tgz
node scripts/check-package.mjs .dsh/dsh-collaboration-client.tgz
pnpm run install:check github:Lafinger/dsh-collaboration-client
pnpm run install:check github:Lafinger/dsh-collaboration-client#v0.6.3-rc.6
```

GitHub来源验证需要网络，单独运行，不让普通离线check依赖远端状态；CI只在推送 v* 标签时执行它，并把结果作为发布 GitHub Release 的前置条件，因此"可安装"在发布前就有证据，而不是发布后才发现。

该检查在临时 HOME 中挂载安装结果，并用 `DSH_COLLABORATION_CLIENT_CONFIG` 等环境变量清空外部配置，所以已配置过客户端的机器也能得到干净安装的结论。断言读的是 `collaborationMemberConnection.resolved.state`（设置界面读的同一字段），因为 `collaborationMemberStatus` 只在连接变更时才赋值，未配置时始终是 `{}`。

真正DSH安装验证只用专用profile，不写desktop/acp。联合服务端验收仍独立，CI不依赖兄弟仓库。
