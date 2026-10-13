# 客户端验证

## 0.2.1显式环境覆盖修复

最终检查发现旧解析器文档宣称支持DSH_COLLABORATION_CLIENT_CONFIG但未实际读取。本轮用新patch修复，不覆盖已公开0.2.0。优先级configFile > 环境 > 新默认目录；完整inline独立使用，不与环境文件拼接，非法相对环境路径安全待配置。新增回归，本地26单元+6集成与21文件抽取包PASS，仍协作v2/服务端0.3.0。此patch不修改用户配置、不迁移身份、不调用模型；正式main/tag Windows+Ubuntu CI/Release、固定GitHub安装、下载hash核验及真实DSH installer均PASS，见[发行证据](RENAME-RELEASE-VERIFY.md)。

## 0.2.0命名与协作协议v2（已发布历史）

- 全部当前英文标识、服务名称及SSH固定命令已统一；显示名协作服务，默认provider collaboration-remote。
- 新默认配置home/.dsh/dsh-collaboration-client/collaboration-client.json；子进程隔离home回归证明旧根目录文件不回退，新目录带BOM JSON正常加载，不写真实用户配置。
- 基础ACP-shaped版本1与协作扩展v2独立；缺失/旧/未来/字符串协作版本和错误基础版本在identity/session/business前拒绝，无downgrade或retry，失败不生成mapping/submission。
- 本地Node24.21.0/pnpm11.7.0：25单元、6官方接口集成、1显式联合契约PASS。新版tarball20文件，抽取包安全待配置挂载PASS，冻结依赖与命名/链接审计PASS。
- 新版GitHub CI/Release/固定来源安装已完成，见[新版验收](RENAME-RELEASE-VERIFY.md)；不能用以下0.1.x历史证据冒充当前版本完成。现用两台GUI由用户卸载重装，本轮不代替其GUI验收或调用真实模型。

## 检查方式

`pnpm run check` 使用本仓独立 node_modules、lockfile 与测试替身，不读取原仓库或服务端源码。`pnpm run check:joint` 必须显式提供另一仓绝对路径，专门检查契约一致；不属于日常独立检查的依赖。

覆盖 SSH 强制 host key/key-only 参数、服务/account 不符拒绝、稳定 message ID 零重发、恢复失败不新建、自动恢复记录、并发附加去重、进程重启后 submission 不重放、协议非法帧关闭；官方 LLM adapter chunk 装配、schema 与插件 apply/recovery notice 测试使用真实 DSH 接口。

打包检查确认 main/exports/bundle 文件与内部相对 import 全在 tarball 中，并在抽取的独立目录加载插件；外部官方依赖来自本仓，不依赖旧业务目录。

## GitHub-only 自动构建与发布

工作流双平台检查（Linux/Windows）→ 一份经核验的包 → tag-only GitHub Release；不发布npm或插件市场。package保留private:true，安装入口在仓库，无prepare/install构建。

本地新增四项发布策略与四项Release API替身测试：标签不符/非本仓/开启npm发布/需要安装构建均拒绝；首次draft上传后公开、相同附件重跑、不同附件拒绝覆盖、公开版本缺附件拒绝修改。

GitHub来源与线上Actions/Release已实际验证：main和v0.1.2双平台CI成功，tag自动Release公开，默认分支和固定tag都通过真实DSH installer与宿主挂载；下载附件hash核验和同产物重跑通过。证据见[首版验收](GITHUB-RELEASE-VERIFY.md)，步骤见[发布说明](RELEASE.md)。

## 0.1.2 修复：空配置启用异常

真实 `ctx.plugin(plugin, bundled-empty-config)` / `fiber.await()` 先重现截图的 `ValidationError: $.serviceId missing required value`。根因是0.1.1 required schema在 apply之前拒绝空字段，而且没有GUI配置表单。

修复不是默认假账号/假服务器，也不是取消连接校验：schema接受初始未配置状态，独立解析器在建库/注册adapter之前验证完整连接。缺失、非法JSON、服务端密钥字段、含不支持SSH字段、相对路径或不安全主机均安全待配置，日志不回显密钥。完整配置才创建客户端私有状态库并注册adapter，连接仍是lazy。

新增[配置模板](../examples/client-config.example.json)、[配置检查](../scripts/check-config.mjs)和用户默认JSON入口。GUI没有配置表单，已在安装文档明确，不宣称不存在的配置按钮。

- 原失败复现修复后 **PASS**，空配置不产生client/adapter/SSH。
- 单元测试 **13/13 PASS**；真实0.2插件集成 **6/6 PASS**，包括JSON入口配置完整后的实际挂载。
- 已安装应用内0.2模块集成 **6/6 PASS**。
- 未改动服务器的联合协议与双循环测试 **3/3 PASS**。
- 修正版 tarball 真实安装 **PASS**，安装副本使用应用内模块验证 **emptyEnable PASS / jsonConfiguredMount PASS**，没有发起SSH。
- 冻结依赖、包完整性、代码/文档链接审计 **PASS**。

## 0.1.1 修复：当前 DSH 安装拒绝

根因：0.1.0 将 `dsh-llm` / `dsh-session` peer 精确固定到 0.1.5-rc.2，而用户宿主为0.2.0-rc.2。真实安装器在独立 profile 两次重现截图中的拒绝、退出码1、nothing was installed；不是服务器错误。

先用已安装 Electron Node 模式直接运行插件接口集成并通过，再更新 peer 和 lockfile，不放宽到通配范围，不授予版本豁免。0.1.1 精确固定到已验证宿主0.2.0-rc.2、Cordis4.0.4、Schemastery3.18.4，业务/协议代码不变。

- 新包版本约束回归先失败、修复后通过；单元测试 **9/9 PASS**。
- 本仓0.2依赖集成 **4/4 PASS**，包括真实 `ctx.llm.stream` route、辅助调用拒绝、schema、恢复 notice。
- 本机安装的0.2官方模块集成 **4/4 PASS**，不是只使用 npm 模拟旧版。
- 同一真实安装复现命令修复后退出码0，隔离 profile 注册 package/bundle；无版本豁免。
- 更新后的客户端与未升级服务器联合测试 **3/3 PASS**；协议文件不变。
- 修正版 tarball 真正安装后，用应用内0.2服务挂载该安装副本，注册 `server-agent` 成功，未发起 SSH。

isolated profile 的 `pnpm peers check` 报 host-supplied peers 不在 profile 自己的依赖树中；检查退出码1已记录，不用安装第二套 runtime 来消除提示。宿主模块直接挂载通过，但完整 profile `--help` 在当前隔离环境持续等待而未产生反馈，已取消。因此不宣称完整 profile 启动或 GUI 验收通过。

[真实安装检查脚本](../scripts/check-install.ps1)可复跑接受/拒绝检查；只允许专用隔离 profile。现用 desktop profile 没有改动。完整 GUI/SSH 验收仍见下方边界。

## 拆分时 0.1.0 历史结果

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
