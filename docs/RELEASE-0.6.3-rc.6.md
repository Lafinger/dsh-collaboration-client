# 0.6.3-rc.6 候选：附件链路重构（协作v4／附件v2／人类授权v3）

## 安装

```text
github:Lafinger/dsh-collaboration-client#v0.6.3-rc.6
```

装完确认版本显示 `0.6.3-rc.6`。本插件不是官方插件，不自动更新；若仍显示旧版本，须先卸载旧插件再装。

> Release 页面（`…/releases/tag/v0.6.3-rc.6`）只用于查阅附件与说明，**不是**安装入口。安装器只接受包名、git 仓库地址或 tarball 地址，填网页地址会报 `a URL must point at a git repository or a tarball`。
>
> **本版与服务端硬配对**：必须与 `dsh-collaboration-acp-server` v0.7.2-rc.7 同批安装。旧客户端对新服务端（或反之）在 `initialize` 即失败，不存在混跑。

## 为什么改

卡死会话的逐条证据显示三类失败叠加：客户端意图门按正则把整轮拦死在本地（`human-intent.mjs` 的罐头话术在模型收到任何字节之前就终止了轮次）；附件工具面是 handle/receipt 双标识接力（5 个工具），模型在链路中迷失并声称"缺少工具"；授权按轮失效，跨轮引用历史附件必然失败。设计依据是服务端仓库的 `.dsh/redesign-attachment-spec-20261029.md` 与 ADR-0009（授权即上传）。

## 改了什么

- **删除客户端意图门**：`src/human-intent.mjs` 整文件删除，`human-admission.mjs` 只保留最小准入。自然语言不再被本地正则拦截或改写，文本原样转发；附件轮次只在未选定项目时本地失败（零字节上传），提示先选项目。
- **上传即授权**：附件作为清单随消息发出，字节在服务端 prompt 入口拉取入库。客户端不再签发任何按动作许可，`attachments.mjs` 的 `authorization()` 存根删除。
- **单一标识**：只有 handle，不再有 receipt。`docs/PROTOCOL-v3.json` → `docs/PROTOCOL-v4.json`（内容更新，含新的人机授权元数据段）。
- **人类授权元数据 v3**：每个 prompt 只带 `{version:3,messageId,textSha256,projectId}`；`attachmentScopes`/`receiptScopes` 删除。
- **会话项目绑定**：菜单选择是唯一来源；`session/new` 在已选项目时携带项目，使服务端会话范围与授权元数据指向同一项目。
- **归档回话**：去重时说明"内容相同、未新增版本"，不再出现恢复确认分支。

## 修复的问题

联合测试（真实客户端捕获路径 + 真实服务端运行时）暴露并修复了两处客户端语义错误：

1. 文本轮次在协商到 v3 时未携带人类授权元数据，服务端要求每个 prompt 都有，导致整轮被拒并回"剩余业务结果尚未确认"。
2. 无登录会话的 `session/new` 未携带菜单选定项目，服务端项目范围为空，附件授权校验报项目不匹配。

另外 `src/attachment-protocol.mjs` 以服务端为准同步（每条清单项必须带 `projectId`）。

## 验证

- 全量门禁 `pnpm run check`：**exit 0**（单元 142、集成 63、依赖审计、命名检查、构建全过）。
- 双端联合 `pnpm run check:joint`（需 `DSH_COLLABORATION_SERVER_ROOT`）：2/2 通过——协议字节契约一致、QR MVP TLS 双客户端登录往返通过。

## 残留风险与边界

- 未在真实 DSH GUI 里做真人业务验收；结论来自离线自动化与双端联合测试，未调用真实模型。
- 协议硬配对不可灰度：服务端未升级前，本客户端无法连接；反之亦然。
- 服务端旧会话中已接收的 v3 附件（receipt）不能被新链路读取，需成员重新上传一次，不回填。
