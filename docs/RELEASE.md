# GitHub 构建、发布与安装

## 范围

只向 GitHub 发布，不向 npm registry 或 DSH 插件市场发布。保留 `private:true` 与 `UNLICENSED`；没有 NPM_TOKEN、OIDC npm 发布、市场投稿或登记步骤。官方依赖下载可能访问 npm，这与发布本插件到 npm 是两回事。

本插件的执行入口是仓库内的 `.mjs`，不需要 prepare/install/prepack 构建。`github:` 来源可直接取得 main/exports、bundle patch、配置模块和模板，不依赖工作区 build 输出。

## 自动触发

[工作流](../.github/workflows/release.yml)：

| 事件 | 行为 |
|---|---|
| Pull request | Linux + Windows 检查/测试；通过后打包并保存 Actions artifact |
| main 提交 | 同上，不创建 Release |
| workflow_dispatch | 手动检查/打包，不创建 Release |
| 推送 v* 标签 | 校验标签等于包版本且提交属于 main；上述检查全部通过后发布 GitHub Release |

Node24.21.0 / pnpm11.7.0固定；依赖冻结 lockfile且禁止 lifecycle scripts。双平台回归后只在Linux打包一份，Release下载同一已验证artifact，不重新构建。

构建仅 contents:read；只有tag发布job有contents:write。PR不使用pull_request_target，也不接收发布token。仓库自带的GitHub Actions token用于创建Release，通常不需要额外Secret。

## 安装入口

DSH 插件管理器输入：

```text
github:Lafinger/dsh-collaboration-client
```

这会安装默认分支代码，不自动选择最新 Release。正式使用建议固定版本：

```text
github:Lafinger/dsh-collaboration-client#v0.1.2
```

隔离 CLI 验证示意：

```sh
dsh plugin --profile collaboration-compat-github add github:Lafinger/dsh-collaboration-client --ignore-scripts
dsh plugin --profile collaboration-compat-github-tag add github:Lafinger/dsh-collaboration-client#v0.1.2 --ignore-scripts
```

还可在[Releases](https://github.com/Lafinger/dsh-collaboration-client/releases)下载 `.tgz`，核对 SHA256SUMS 后安装。main移到新提交不改变已固定的tag；版本tag/附件不得移动或覆盖。

安装后默认禁用。启用空配置仅是安全待配置，不表示业务连通。真实账号/SSH/key/known_hosts按[连接配置](INSTALL.md)填写；GUI、真实SSH和模型验收不是CI自动发布的结论。

## 首次/后续发布

首次标签是 v0.1.2。后续：

1. 在[包配置](../package.json)升版，保持支持的DSH精确版本。
2. 更新必要文档；使用pnpm更新lockfile并执行check、pack/pack:check。
3. 提交并push main，等待对应CI成功。
4. 创建带注释的版本tag，push tag：

```sh
git tag -a v0.1.3 -m "Release v0.1.3"
git push origin v0.1.3
```

这里0.1.3仅是下次示例，必须和package.version相同。不能只改标签不升包版本。带rc/beta等版本自动标prerelease，普通版本设为latest。

5. 检查GitHub Actions结果和Release附件，再在独立环境安装固定tag。

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
pnpm run install:check github:Lafinger/dsh-collaboration-client#v0.1.2
```

GitHub来源验证需要网络，单独运行，不让普通离线check依赖远端状态。真正DSH安装验证只用专用profile，不写desktop/acp。联合服务端验收仍独立，CI不依赖兄弟仓库。
