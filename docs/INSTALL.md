# 客户端安装与预配置

## 边界

本项目是 DSH host-side Cordis 插件，不是新 Web 应用。已验证官方 0.1.5-rc.2 插件接口与打包入口，尚未验证现用 0.2 GUI 的加载/渲染；不能将本说明当作 GUI 验收通过。

插件使用独立成员 SSH 密钥，服务器地址、账号和 known_hosts 由部署人员配置。服务器指纹必须通过可信渠道核对，不使用自动跳过检查或首次无条件接受。

## 打包与隔离安装

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pnpm pack --out .dsh/dsh-collaboration-client.tgz
# 只在准备好的隔离 profile 中执行，禁止直接改现用 profile：
dsh plugin --profile collaboration-client-test add /absolute/dsh-collaboration-client.tgz
```

[包配置](../package.json)声明 main/exports/dsh bundle；[bundle patch](../cordis.patch.yml)默认 disabled，空配置不会连接服务器。安装后通过隔离 profile 的覆盖 patch 提供完整 config 并 `disabled:false`。示意（不要将真实密钥或数据库提交 Git）：

```yaml
- id: collaboration-client
  disabled: false
  config:
    provider: workbench-remote
    model: server-agent
    serviceId: workbench-test
    databasePath: /absolute/client-state/client.sqlite
    ssh:
      host: server.example
      account: alice
      port: 22
      identityFile: /absolute/client/key
      knownHostsFile: /absolute/client/known_hosts
```

profile patch 语法必须以部署使用的 DSH loader 实际配置为准；本轮没有安装或运行 GUI profile。已有桌面环境可直接使用本地绝对路径插件 entry 和同样 config 做隔离测试。

父目录需预先存在；`databasePath` 为客户端自己的状态库。绝对 identityFile/knownHostsFile、key-only、BatchMode、StrictHostKeyChecking 与禁止 agent/端口转发不可移除。服务端 forced command 固定 `workbench-connect`，它是轻量连接器，不启动第二套 DSH。

## 使用

在本地会话选择 provider/model `workbench-remote/server-agent`。业务工具和模型决策在服务端；本地的工具定义、系统上下文、旧历史不被转发。图片和文件传输不在当前范围。

自动重连仅恢复连接和本人会话；上一轮结果未知时，先阅读恢复记录再明确发新消息，不自动“再执行一次”。详见[恢复行为](RECOVERY.md)。
