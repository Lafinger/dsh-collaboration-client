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

## 开发与检查

要求 Node >=24、pnpm，官方接口固定 `0.1.5-rc.2`/Cordis `4.0.2`。使用本项目 lockfile 安装，不升级宿主 DSH：

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
