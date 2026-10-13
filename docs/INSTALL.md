# 客户端安装与连接配置

## 安装、配置、连通是三件事

客户端 **0.2.1** 对应服务端 **0.3.0**，宿主精确 **DSH0.2.1-rc.2 / Cordis4.0.4 / Schemastery3.18.4**。通信使用[协作扩展协议v2](PROTOCOL-v2.json)，基础ACP-shaped版本仍1；客户端、connector、服务器均拒绝缺失/旧/错误协作版本，不自动降级或业务重放。

插件默认禁用；空配置启用安全进入待配置，不建库、不注册远端模型、不发SSH。没有浏览器配置表单；只配置成员自己的JSON，不能加入服务端签名秘密或模型API Key。

## Windows最短步骤

1. 在DSH插件管理器安装：

   ```text
   github:Lafinger/dsh-collaboration-client#v0.2.1
   ```

   默认分支来源也支持，但不会自动选择最新Release；详见[发布说明](RELEASE.md)。

2. 创建当前用户目录 `.dsh/dsh-collaboration-client/`，将[空模板](../examples/client-config.example.json)复制为其中的 `collaboration-client.json`。

   ```powershell
   $directory = Join-Path $env:USERPROFILE '.dsh\dsh-collaboration-client'
   $configPath = Join-Path $directory 'collaboration-client.json'
   New-Item -ItemType Directory -Path $directory -Force | Out-Null
   # 编辑前检查已有文件；不要自动覆盖。
   Test-Path -LiteralPath $configPath
   ```

   **默认只读这个新路径**，不自动读取旧的用户 `.dsh/collaboration-client.json`；没有自动迁移/猜账号/建真实配置。

3. 填写部署提供的真实参数：

| 字段 | 内容 |
|---|---|
| serviceId | 与服务端相同的服务标识 |
| databasePath | 此成员私有映射SQLite绝对路径，不是服务器业务库；不同成员/服务不共用 |
| ssh.host | 服务器实际IP/域名，不能把另一机器的127.0.0.1当服务器 |
| ssh.account | 服务器已创建的SSH成员账号，与密钥匹配，不是GUI昵称或项目角色 |
| ssh.port | 实际发布端口 |
| ssh.identityFile | 本机成员私钥绝对路径，仅路径，不是密钥正文 |
| ssh.knownHostsFile | 经可信渠道核验的服务器主机公钥记录绝对路径 |
| ssh.sshExecutable | 可选，本机OpenSSH程序路径 |

Windows路径可用正斜杠或JSON双反斜杠。密钥可保留原安全位置，无须与配置同目录，跨机器须改成本机实际路径。不要把模型API Key、另一个成员的私钥或服务端认证凭据复制进客户端。

4. Node24只读配置检查（不会建库或连接）：

   ```powershell
   node scripts/check-config.mjs "$env:USERPROFILE\.dsh\dsh-collaboration-client\collaboration-client.json"
   ```

   退出0/configured只证明结构完整，不证明SSH/密钥/服务器可用。

5. 关闭再打开collaboration-client组件；配置成功注册provider/model **collaboration-remote/server-agent**，显示名称**协作服务**。新会话选择此模型后，首次纯文本业务消息才连接。实际模型在服务器，客户端不需模型凭据。

## 显式配置

默认路径之外仍支持启动环境 `DSH_COLLABORATION_CLIENT_CONFIG`、组件 `configFile`，以及完整内联连接参数。不要同时用configFile与内联连接字段，不把部分字段与默认文件拼成身份：

```yaml
- id: collaboration-client
  disabled: false
  config:
    configFile: /absolute/member-client.json
```

显式旧位置只在用户主动指定时读取，不是自动回退。环境变量会覆盖默认路径，重装后应检查是否有旧的显式设置。

provider/model可自定义，默认collaboration-remote/server-agent；严格host key、publickey-only、无转发、固定远端collaboration-connect不可更改。服务端使用forced connector，不开放shell/SFTP。

## 清空服务器后的重新测试

插件卸载不保证删除databasePath指向的外置映射库。服务器清空后旧本地对话不能恢复，不静默替换为新会话，不重发旧指令。

1. 停止组件/退出DSH，先核对旧配置databasePath属于本插件成员状态，而不是普通DSH数据库/服务器业务库。
2. 删除仅该插件专用SQLite及对应-wal/-shm边车；不删除整个.dsh，不删除普通聊天历史/密钥/known_hosts。
3. 在新目录建立配置，使用新的独立数据库路径，卸载重装固定新版并启用。
4. 必须新建测试会话并选择协作服务，不继续旧会话或点旧消息重试。

## 开发与隔离验证

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pnpm pack --out .dsh/dsh-collaboration-client-0.2.1.tgz
node scripts/check-package.mjs .dsh/dsh-collaboration-client-0.2.1.tgz
```

[包配置](../package.json)、[bundle patch](../cordis.patch.yml)默认disabled；[隔离安装检查](../scripts/check-install.ps1)只允许专用profile，不修改现用desktop/acp或启动替代Web服务。恢复语义见[恢复规则](RECOVERY.md)。历史0.1.x安装证据见[旧版验收](GITHUB-RELEASE-VERIFY.md)，不是新版通过的证明。
