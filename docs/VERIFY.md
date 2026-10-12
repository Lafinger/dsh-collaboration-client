# 客户端验证

## 检查方式

`pnpm run check` 使用本仓独立 node_modules、lockfile 与测试替身，不读取原仓库或服务端源码。`pnpm run check:joint` 必须显式提供另一仓绝对路径，专门检查契约一致；不属于日常独立检查的依赖。

覆盖 SSH 强制 host key/key-only 参数、服务/account 不符拒绝、稳定 message ID 零重发、恢复失败不新建、自动恢复记录、并发附加去重、进程重启后 submission 不重放、协议非法帧关闭；官方 LLM adapter chunk 装配、schema 与插件 apply/recovery notice 测试使用真实 DSH 接口。

打包检查确认 main/exports/bundle 文件与内部相对 import 全在 tarball 中，并在抽取的独立目录加载插件；外部官方依赖来自本仓，不依赖旧业务目录。

## 拆分后实测结果

Windows、Node 24.21.0、pnpm 11.7.0、各自 fresh node_modules 和 lockfile：

- 独立单元测试 **8/8 PASS**。
- 真实官方接口集成 **3/3 PASS**（adapter、Config schema、plugin mount/recovery）。
- 显式联合契约检查 **1/1 PASS**；服务端联合测试同时覆盖该客户端。
- tarball 内容与抽取后插件加载 **PASS**，打包无数据库/密钥/依赖目录。
- 代码相对 import/文档链接审计 **PASS**。

首次新增测试把官方 `BlockAssembler.blocks()` / `finish` 错当属性，查阅接口后修正测试。首次打包 smoke 的全量依赖重定向破坏 pnpm 传递依赖解析，去掉 hook 使用本仓正常依赖解析后通过；未修改业务行为。

## 未通过的验收层

真实 SSH 登录、Linux forced command 与指纹拒绝、现用 GUI 0.2 加载/渲染、真实模型未执行。不能将本仓自动化结果冒充这些验收。

源原型历史结果为 19 项接入+8 项集成+282 项业务测试；本仓职责拆分后重新计数，以 `.dsh/evidence` 及最终报告为准。未使用 subagent，未安装现用 profile。
