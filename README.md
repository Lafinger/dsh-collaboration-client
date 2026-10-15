# dsh-collaboration-client

客户端 DSH 插件：通过隐藏的 SSH 连接访问独立协作 ACP 服务，保存本地/远端会话映射，恢复记录但不重发业务指令。

> 来源：`dsh-project-workbench` 提交 `3e0b76c`。这是保留真实名称的历史来源，不引用原仓库或服务端源码。新版验收边界见验证文档。

## 0.5.3：完整项目菜单、原生外观与GIF禁传

本轮正式发行目标v0.5.3，包含原0.5.2全部功能。新增GIF双端拒绝：客户端在授权／传输前检查名称、类型及字节，服务端再次验证，不自动提取首帧或转换绕过。图片用法与实际模型能力见[附件指南](<docs/ATTACHMENTS.md>)；服务器CPA切换不要求修改成员配置，不向客户端下发模型key。

会话右下角按钮恢复DSH0.2.0-rc.2原生样式：13/20/400字体、原生间距、独立次级色推理等级、共享SVG箭头／忙碌状态和窄屏图标，长名称按原生规则截断。仅恢复触发按钮外观，不回退项目菜单或0.5.1依赖修复；项目获取、绑定和登录规则不变。[样式范围与验证](<docs/MODEL-TRIGGER-STYLE.md>)。

修复0.5.0“已登录但只有项目选择”的现场错误：官方modelDirectories在调用者作用域读取remote.session，缺少依赖声明会让项目菜单崩溃并回退。0.5.1补齐Remote依赖；新增官方Loader＋可追踪Service回归，同一测试对已安装0.5.0报相同错误、修复构建通过。旧测试的普通Remote对象绕过了该检查，不能作为此故障已通过的证据。[根因、测试与无模型复测](<docs/MENU-INJECT-FIX.md>)。

按[Q1—Q13设计确认](<docs/设计确认-模型菜单项目选择.md>)移除输入框附近的独立项目区、确认绑定和刷新按钮；模型菜单的Collaboration组直接列出当前成员可访问项目。每次服务商／模型列表展开主动读取服务器项目，搜索／重绘不重复请求；点击项目同时确定当前会话项目和固定协作路由，成功后显示项目标识／名称及勾选。项目不是底层模型，不调用模型取项目或自动提交消息。

新会话必须明确点选，不继承项目；已建立远端对话只能返回原项目，可主动切回普通模型，换项目需新建会话。撤权／删除与网络查询失败分开显示，失败不能用旧缓存新绑定。选择使用当前Agent维护阶段、公开model/selection事件及本机提交日志，不保存协作全局默认；未确认结果停止相关选择／业务，重开菜单读取实际状态，不自动重试。普通模型搜索／分组／推理等级／键盘操作保留，插件卸载恢复官方菜单。

客户端GitHub发布不代装DSH，不修改现用GUI／profile／成员配置；Ubuntu服务器另按已确认的固定SHA流程升级。**不验证真实模型交互，不重发旧消息**。官方依赖的隔离DOM／Host编解码与请求组装测试不等于现用GUI或业务模型验收。升级与兼容说明见[项目菜单指南](<docs/PROJECT-MENU.md>)。

## 保留0.4.2诊断修复：扫码按钮报Connection ended

本机配置已可读但扫码按钮报Connection ended时，0.4.1的SSH stdout提前结束会掩盖stderr与退出原因。0.4.2修复终止顺序及有界分类诊断，显示SSH／远端启动／socket／协议线索、阶段与退出码，不回显原始stderr或凭据、不自动重试。真实登录失败的现场原因仍需新错误文本或脱敏日志确认，**不是声称已修复服务器或钉钉**。[诊断与复测](<docs/LOGIN-CONNECTION-DIAGNOSTICS.md>)。

## 保留0.4.1修复：设置页无法读取状态

0.4.0设置入口可见，但Host成功响应用了`data`而官方Connection使用`value`；官方浏览器解码丢掉状态，面板停在读取并报错。0.4.1统一成功响应和浏览器消费契约，并在格式不兼容／HTTP失败时明确提示、不伪装持续加载。新增测试使用真实Host组件、官方Connection编解码器及共享Fetch路由，不再用RPC替身返回假成功；状态、配置、设备登录与项目绑定均跨此链路验证。详见[修复记录](<docs/LOCAL-STATUS-RPC-FIX.md>)。

旧0.5.2本地包保持原样；升级使用0.5.3，重启DSH并刷新页面，无需修改原成员JSON或profile。本轮不代为安装现用GUI。

## 保留0.4.0功能：自动发现、默认启用与设置入口

- 默认读取当前用户 `.dsh/dsh-collaboration-client`：优先有效顶层标准JSON，否则只发现一级子目录同名文件；唯一自动采用，歧义由设置页选择。
- **设置 → 协作服务** 仅管理连接与钉钉设备身份；可选择、导入和恢复自动模式，无需手改profile补丁或原JSON，不覆盖已有配置。
- 新安装默认启用本机组件，尊重用户已有禁用；不自动连接、扫码、调用模型或发送消息。
- 当前会话模型菜单 **Collaboration** 分组直接列出授权项目，展开刷新、点选绑定；没有独立项目区或刷新按钮，已有远端映射不换项目。
- 切换需先退出且不能忙碌，重新扫码；配置丢失／变化失败关闭，不迁移、清库或重放。

0.5.3同时生成可核验安装包并按已确认流程发布GitHub。官方Loader／设置壳／模型选择器在隔离React DOM中通过链路回归，**不是现用GUI或真实钉钉验收**。用法见[安装说明](<docs/INSTALL.md>)与[扫码指南](<docs/DINGTALK-LOGIN.md>)。

## 保留0.3.1修复：Web启动导入失败

修正DSH保留的浏览器出口：`./client` → `lib/client.js`。旧配置错误指向含 `node:sqlite` 的Node端成员实现，宿主把它当普通浏览器脚本执行，触发 `Cannot use import statement outside a module` 并中止启动。Node API现在使用 `dsh-collaboration-client/member-client`，不要继续通过 `/client` 在Node端导入MemberClient；`/client-ui`保留为浏览器文件别名。回归覆盖官方DSH0.2.0-rc.2清单解析、实际组合脚本路由与浏览器模块加载器，不再仅直接读取构建文件。[修复记录](<docs/CLIENT-BOOT-FIX.md>)。

**本修复仅修改源码、隔离测试和生成安装包，没有重新安装用户已卸载的插件，没有修改现用GUI/profile；实际安装、刷新及扫码由用户自行验证。**

## 钉钉设备登录与协作v3

当前工作区包含设置中的钉钉身份登录、当前会话项目选择与保留的兼容只读API（设置不提供历史／通信业务入口），使用[协议v3](<docs/PROTOCOL-v3.json>)，只允许同账号设备登录后的项目业务；SSH不再单独授予业务权限。token仅驻客户端Host内存。**已有v0.3.0标签不包含这些功能**，客户端使用0.5.3并配合支持v3的服务端；不以旧标签验收新版，也不代装现用GUI。当前用法见[扫码登录指南](<docs/DINGTALK-LOGIN.md>)。旧版发行、安装和验收结论保留历史，不代表真实钉钉通过。

## 目录

- [src/member-plugin.mjs](src/member-plugin.mjs)：Cordis 插件入口、LLM adapter、恢复 notice。
- [src/member-client.mjs](src/member-client.mjs)：持久映射、稳定消息提交标识、自动恢复。
- [src/ssh.mjs](src/ssh.mjs)：固定 SSH 命令、严格服务器指纹校验、密钥登录。
- [配置与安装](docs/INSTALL.md)、[恢复行为](docs/RECOVERY.md)、[当前通信契约](<docs/PROTOCOL-v3.json>)、[验证记录](docs/VERIFY.md)。
- [术语](GLOSSARY.md)、[来源](PROVENANCE.json)。

客户端不含服务端签名密钥、账号认证权威或业务库。只有自身会话映射使用的 SQLite，不与服务器业务库混用。保留本地 DSH loop，但不调用本地业务模型；转发最新有稳定 ID 的 user-source 指令。附件0.3.0新增当前消息明确授权文件的工具分块传输，不开放任意本地文件访问，见[附件用法与边界](<docs/ATTACHMENTS.md>)。

## 从 GitHub 安装

DSH 插件管理器安装来源填写：

```text
github:Lafinger/dsh-collaboration-client
```

正式固定来源为`github:Lafinger/dsh-collaboration-client#v0.5.3`，须等对应CI／Release成功后安装；历史`#v0.3.0`不包含本轮功能，不要把旧标签当作本次验收包。无版本入口读取默认分支，不自动选择最新Release。仅GitHub构建/发布，不发布npm或插件市场；自动测试、标签发布和Release下载见[发布说明](docs/RELEASE.md)，当前证据见[新版线上验收](docs/RENAME-RELEASE-VERIFY.md)，旧首版证据在[历史记录](docs/GITHUB-RELEASE-VERIFY.md)。

## 首次配置

安装0.5.3后组件默认启用，但启用不代表连接或认证。已有有效成员配置可自动读取；没有配置进入安全待配置，不建库、不注册远端模型、不发SSH。在设置中选择或导入管理员提供的成员连接JSON即可，不必手改原文件；[空模板](<examples/client-config.example.json>)仅供管理员参考，不猜真实参数。详细规则见[连接配置](<docs/INSTALL.md>)。

## 开发与检查

当前客户端 **0.5.3** 对应宿主 **DSH 0.2.0-rc.2**，Cordis `4.0.4`、Schemastery `3.18.4`。要求 Node >=24、pnpm，使用本项目 lockfile 安装；旧客户端 0.1.0 的 0.1.5 peer 声明会被当前安装器正确拒绝，不应使用版本豁免绕过。本轮对应服务端0.5.0（固定成功提交部署）、协作扩展协议v3（ACP-shaped基础版本1）和附件扩展1，严格拒绝旧v2及SSH-only业务回退。已发布0.3.0／服务端0.4.1的v2说明属于历史。图片支持传输归档不等于模型支持视觉分析。

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

打包插件默认启用本机组件，用户后置明确禁用仍有效；安装和启动不自动访问服务器，成员明确扫码／业务操作才连接。没有修改现用desktop/acp profile、成员配置、Linux部署或替换现用Web服务。

## 许可证

本仓库当前代码以 [MIT License](LICENSE) 授权，Copyright (c) 2026 Lafinger。第三方依赖遵循各自许可证。已发布的 v0.1.2 标签及附件保持原样；此次改名以新版本发布，不重打标签或覆盖旧附件。
