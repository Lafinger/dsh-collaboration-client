# 客户端安装与连接配置

## 先区分安装、启用和连通

客户端 **0.1.2** 对应 **DSH 0.2.0-rc.2 / Cordis4.0.4 / Schemastery3.18.4**。

- 0.1.0 因过旧 peer 约束被当前安装器拒绝；不要使用版本豁免绕过。
- 0.1.1 安装成功但直接启用空配置会报 `serviceId missing required value`。
- 0.1.2 空配置启用进入**待配置**状态，不变成异常组件；不创建数据库、不注册业务模型、不发起 SSH。
- 安装/待配置不等于已经连接服务器；真实 GUI 渲染、SSH 身份及业务连通仍需验收。

本插件尚无浏览器配置表单；不要寻找不存在的“配置”按钮。通过成员自己的 JSON 文件配置，无须改现用 profile。服务端签名密钥不能放进客户端。

## Windows 最短配置步骤

1. 在DSH插件管理器输入 `github:Lafinger/dsh-collaboration-client`，或固定版本 `github:Lafinger/dsh-collaboration-client#v0.1.2`。也可下载GitHub Release的tgz安装；区别见[发布说明](RELEASE.md)。
2. 将[空配置模板](../examples/client-config.example.json)复制为 `%USERPROFILE%\.dsh\collaboration-client.json`（本机对应 `C:\Users\cjh13\.dsh\collaboration-client.json`）。**若目标已存在先阅读，不要覆盖。**
3. 填写部署人员提供的真实信息：

| 字段 | 填写内容 |
|---|---|
| serviceId | 服务端配置的 serviceId，必须一致 |
| databasePath | 客户端私有状态库绝对路径，不是服务端业务库；父目录由配置完成后的插件创建 |
| ssh.host | 实际 SSH 主机名/IP |
| ssh.account | 实际独立 SSH 登录账号，不是 GUI 昵称或项目角色 |
| ssh.port | SSH 端口，通常22，以服务器配置为准 |
| ssh.identityFile | 本机成员 SSH 私钥文件的绝对路径，只填路径、不填密钥正文 |
| ssh.knownHostsFile | 已通过可信渠道核对服务器指纹的 known_hosts 绝对路径 |

Windows JSON 路径可以使用 `C:/Users/...`，或把反斜杠写成 `\\`。模板中的空字符串必须替换；本仓没有真实服务器地址和账号，不能用示例假装已连通。

4. 用 Node24 配置检查，不会建库或连网：

```powershell
node scripts/check-config.mjs "$env:USERPROFILE\.dsh\collaboration-client.json"
```

退出0 / `configured` 只证明字段和 SSH 参数格式完整，**不证明私钥、host key、网络或服务器可用**。

5. 在插件页关闭再打开“collaboration-client”组件，让它重新读取文件。需要时重启 DSH。配置完整后才注册 provider/model `workbench-remote/server-agent`；在本地会话选择它后，首次业务消息才发起连接。

如果还看到 `serviceId missing required value`，说明正在运行旧0.1.1副本；重新安装0.1.2并重新加载组件。0.1.2 未配置时会给出带路径的中文待配置日志，不会伪装“已连接”。

## 自定义路径与部署覆盖

默认路径为用户 `.dsh/collaboration-client.json`。启动环境可指定 `DSH_COLLABORATION_CLIENT_CONFIG`；已启用组件支持只给 configFile 的 profile overlay：

```yaml
- id: collaboration-client
  disabled: false
  config:
    configFile: /absolute/member-client.json
```

完整内联 config 仍可使用，但不要同时填写 configFile 与内联连接字段，也不要部分填写后指望从默认文件拼接身份。配置切换后重新挂载；不同账号/serviceId 不共用客户端状态库。

provider/model 可在 JSON 中自定义；默认分别为 workbench-remote/server-agent。这不是客户端业务模型，实际模型和工具执行在服务器。严格 host key、key-only、禁止转发与固定远端 `workbench-connect` 不可移除。

## 开发、打包与隔离验收

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pnpm pack --out .dsh/dsh-collaboration-client-0.1.2.tgz
node scripts/check-package.mjs .dsh/dsh-collaboration-client-0.1.2.tgz
```

[包配置](../package.json)和[bundle patch](../cordis.patch.yml)默认 disabled，安装不会自动连接。[隔离安装检查](../scripts/check-install.ps1)只允许专用 profile：

```powershell
./scripts/check-install.ps1 -Cli 'C:\path\to\dsh.cmd' -Package 'C:\absolute\dsh-collaboration-client-0.1.2.tgz'
```

本轮不替用户填正式配置、不修改 desktop profile、不启动替代 Web 服务。恢复行为见[恢复规则](RECOVERY.md)。
