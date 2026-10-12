# dsh-collaboration-client

客户端 DSH 插件：通过隐藏的 SSH 连接访问独立协作 ACP 服务，保存本地/远端会话映射，恢复记录但不重发业务指令。

> 来源：`dsh-project-workbench` 提交 `3e0b76c`。这是独立本地仓库，不引用原仓库或服务端源码；真实 SSH、现用 0.2 DSH GUI 与真实模型尚未验收。

## 目录

- [src/member-plugin.mjs](src/member-plugin.mjs)：Cordis 插件入口、LLM adapter、恢复 notice。
- [src/member-client.mjs](src/member-client.mjs)：持久映射、稳定消息提交标识、自动恢复。
- [src/ssh.mjs](src/ssh.mjs)：固定 SSH 命令、严格服务器指纹校验、密钥登录。
- [配置与安装](docs/INSTALL.md)、[恢复行为](docs/RECOVERY.md)、[通信契约](docs/PROTOCOL-v1.json)、[验证记录](docs/VERIFY.md)。
- [术语](GLOSSARY.md)、[来源](PROVENANCE.json)。

客户端不含服务端签名密钥、账号认证权威、业务库或工作台工具。只有自身会话映射使用的 SQLite，不与服务器业务库混用。保留本地 DSH loop，但不调用本地业务模型；只转发最新有稳定 ID 的 user-source 文本。

## 从 GitHub 安装

DSH 插件管理器安装来源填写：

```text
github:Lafinger/dsh-collaboration-client
```

正式使用可固定发行版：`github:Lafinger/dsh-collaboration-client#v0.1.2`。无版本入口读取默认分支，不自动选择最新Release。仅GitHub构建/发布，不发布npm或插件市场；自动测试、标签发布和Release下载见[发布说明](docs/RELEASE.md)。

## 首次配置

安装后仅启用开关不代表业务连通。0.1.2 空配置进入安全的“待配置”状态；不会连接、不建库、不注册业务模型。将[空模板](examples/client-config.example.json)复制到用户 `.dsh/collaboration-client.json`，填入真实服务Id、SSH主机、独立账号及本机密钥/known_hosts路径；检查后重新启用组件。没有 GUI 配置表单，详细步骤见[连接配置](docs/INSTALL.md)。

## 开发与检查

客户端 **0.1.2** 对应宿主 **DSH 0.2.0-rc.2**，Cordis `4.0.4`、Schemastery `3.18.4`。要求 Node >=24、pnpm，使用本项目 lockfile 安装；旧客户端 0.1.0 的 0.1.5 peer 声明会被当前安装器正确拒绝，不应使用版本豁免绕过。服务器仍保持原有版本，通过版本1协议通信：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pnpm pack --out .dsh/dsh-collaboration-client.tgz
node scripts/check-package.mjs .dsh/dsh-collaboration-client.tgz
```

`check` 独立执行，既不读取兄弟服务端目录，也不读取原工作台构建目录。联合测试另行显式指定路径：

```sh
DSH_COLLABORATION_SERVER_ROOT=/absolute/server-checkout pnpm run check:joint
```

打包插件默认 disabled；部署人员配置并启用后才连接，不在安装时自动访问服务器。没有修改现用 desktop/acp profile，也没有替换现用 Web 服务。
