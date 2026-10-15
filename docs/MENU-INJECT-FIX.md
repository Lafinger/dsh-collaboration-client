# 0.5.1：已登录但项目菜单回退的修复

## 故障与原因

现场0.5.0显示官方“搜索模型…”和Collaboration下单个“项目选择”，没有授权项目行。用户控制台记录 `cannot get property "remote.session" without inject`，调用栈为 `directoryFor → 项目菜单 inject → SessionEntry`；随后 `conversation.input.model` 槽崩溃，renderer撤下该项并恢复官方菜单。只重新扫码、清库或再次安装同一个0.5.0包不会修正依赖声明。

只读核对确认现用包为0.5.0，浏览器构建与此前交付一致；宿主为DSH0.2.0-rc.2。官方modelDirectories是Cordis可追踪Service，调用directoryFor时，方法内的Remote读取采用调用者的依赖作用域。项目菜单只声明locale／modelDirectories／sessions，没有声明remote及remote.session，首次创建会话目录即抛错；如果官方入口先创建过目录，缓存还可能暂时掩盖错误。

## 修复与回归

[浏览器入口](<../client/index.js>)在模型菜单的延迟注入中补齐remote和remote.session，设置页仍只要求connection／slots；不改官方安装文件、不绕过依赖检查，不修改RPC／业务协议或持久化规则。[构建脚本](<../scripts/build-client.mjs>)生成新的经典脚本，包版本为0.5.1。

[专项回归](<../test/menu-runtime-composition.integration.mjs>)使用官方ModuleRegistry／ModuleSystem／Loader／renderer和modelDirectories，并以真实Cordis Service注册Remote及其session命名空间；仅目录数据、项目接口、会话装配和外观原语为隔离fixture。它检查菜单没有崩溃退位、打开后显示具体项目而非“项目选择”、每次打开只查询一次，以及卸载／重新加载。额外将官方模型目录替换为从现用宿主ASAR只读提取的构件，用同一命令指向已安装0.5.0包，复现相同错误并失败；修复构建通过。日常检查不依赖现用应用，仍使用固定版本依赖。

[完整菜单链路](<../test/official-model-project.integration.mjs>)同样改用可追踪Remote Service，保留真实Connection／Host Fetch／成员SQLite、授权刷新、点选提交、未知结果、普通模型／推理等级和卸载回退验证。此前普通对象形式的Remote fixture绕过了命名空间依赖检查，旧116项通过不构成该故障的有效覆盖。命令与最终检查结果见[验证记录](<VERIFY.md>)。

## 现场复测（不调用模型）

1. 在DSH插件管理器选择本地0.5.1安装包进行升级；旧0.5.0包保持原样。不必卸载插件、修改成员JSON／profile或删除数据库。GitHub旧标签不包含这次本地修复。
2. 安装完成后完全退出并重开DSH，再刷新原页面，使Host和浏览器使用新包。重启只是加载已修正的代码，不是故障修复本身；Host重启后内存设备登录失效，按设置页状态重新扫码。
3. 新建一个空本地会话，打开模型菜单并进入“模型”列表。搜索框应为“搜索模型或项目…”，Collaboration内应显示“项目标识 · 名称”或明确的未登录／无权限／查询失败提示，而不是单个“项目选择”。
4. 只点一次有权限的项目，检查模型位置变为具体项目、重开列表对应行打勾。点选只提交本地会话项目及路由，不创建远端业务对话；此轮不要发送“你好”或其他业务消息，也不要重放旧失败消息。
5. 如仍异常，提供插件版本、菜单截图和新增控制台红字；不要提供Cookie、token、私钥或完整网络请求。截图中 `present.open` 附件HTTP500和插件事件流失败是其他路径，本修复未宣称解决它们。

## 验证边界

本轮未代为升级或重启现用GUI，不修改用户profile、成员配置、真实数据库、服务器或DSH安装目录。只读诊断读取插件清单／构建和宿主官方UI构件，不读取浏览器凭据；未经认证的现用HTTP入口返回401，没有绕过认证。测试使用独立HOME／USERPROFILE；没有真实SSH、钉钉、Codego、模型或业务消息调用，也没有subagent／workflow。现用GUI验收仍需上述安装后复测。
