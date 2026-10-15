# 客户端验证

## 0.5.3 GitHub发行与GIF禁传（本地已验，线上待CI）

保留0.5.2全部菜单、注入修复与原生触发按钮样式，新增GIF名称／类型／字节禁传。回归先对旧代码复现失败，修复后定向5项通过：原生图片／文件及显式路径改名GIF不生成上传授权。Windows／Node24.21.0／pnpm11.7.0完整check通过94单元＋27集成、102内部导入／104文档链接及命名审计；抽取包106文件逐字节匹配源码（仅固定pnpm的manifest归一化），独立运行121项全部通过，0失败／跳过。GitHub双平台／Release结果完成后另记；旧0.5.2安装包保持原哈希不覆盖。未代装现用GUI、未真实调用模型，服务器同步独立按已确认固定SHA执行。

## 0.5.2 原生模型按钮外观（本地，现用GUI待升级）

按用户截图恢复会话右下角模型触发按钮的DSH原生字体、行高、间距、推理等级caption色、共享SVG箭头／忙碌状态及窄屏图标，不撤销项目菜单或0.5.1依赖修复。固定官方构件CSS逐项比对回归先失败2项，恢复后通过；完整菜单DOM增加独立名称／High、共享图标、展开旋转、选择后焦点和忙碌状态断言。离线Edge截图对比固定官方组件和重建插件的普通／紧凑样式，使用只读提取的原生SVG，不代表现用GUI像素验收。[范围与复测](<MODEL-TRIGGER-STYLE.md>)。

本轮不代装或刷新现用GUI，不改Host运行源码、用户profile／配置／真实库、DSH安装或服务器，不调用真实SSH／扫码／Codego／模型／消息，无subagent／workflow。测试隔离HOME／USERPROFILE；完整检查通过92单元／27集成（0失败、0跳过），101个内部导入／103个文档链接及命名审计通过；独立抽取包结果以交付证据为准。原安装包保留，不覆盖旧附件。

## 0.5.1 模型菜单依赖修复（本地，现场GUI待安装复测）

用户控制台截图确认 `cannot get property "remote.session" without inject` 在directoryFor内抛出，renderer随后撤下conversation.input.model项目菜单，恢复官方单项“项目选择”。现用0.5.0清单和浏览器构建已只读核对一致；不是未升级或登录失败。新增可追踪Remote Service＋官方ModuleRegistry／ModuleSystem／Loader／renderer回归，对已安装0.5.0只读包先复现同错（1项失败）；补齐remote／remote.session注入后通过。原完整菜单测试亦切换至可追踪Service，普通Remote对象的旧fixture会绕过检查，旧116项不能证明该故障已覆盖。

专项验证通过2项，包括项目行、刷新、提交／权限／失败、普通模型推理等级、卸载／再加载；额外使用从现用ASAR只读提取的官方模型目录构件，同一回归对已安装0.5.0失败、修复构建通过。本仓完整检查通过90单元／27集成（0失败、0跳过），99个内部导入／93个文档链接及命名审计通过；独立抽取包的最终结果记入本轮交付证据。所有成员测试隔离HOME／USERPROFILE，不读取真实成员选择；没有代装／重启GUI、修改现用profile／成员JSON／真实库／DSH安装／服务器，没有SSH／扫码／模型／业务调用，没有subagent。现用HTTP入口401未绕过；用户截图中的present.open附件500不在此故障验收内。[修复与现场复测](<MENU-INJECT-FIX.md>)。

## 0.5.0 模型菜单内项目选择（本地，无真实模型验证）

Q1—Q13设计确认后，独立项目面板仍存在、缺少menu／activate接口的四项回归先红；0.5.0移除独立区，通过公开single槽接替模型菜单，Collaboration直接列授权项目、展开刷新、点选同时设置当前项目与路由，保留普通模型与卸载回退。旧单独面板替身测试移除，验收移到真实菜单打开链路。

官方ModuleRegistry／ModuleSystem／Loader／renderer槽与模型目录、Connection编解码／Host Fetch及成员SQLite通过隔离DOM验证；包括刷新次数、搜索和键盘、改名／撤权／未登录／查询失败、远端映射锁、双击、会话切换乱序、关闭不撤销、提交后丢失响应、卸载和再加载。实际官方SessionController／modelSelection投影／Agent作用域与waterfall验证路由组装，不仅检查UI标签；协作选择不保存全局默认，普通模型／推理等级仍工作。

项目提交日志覆盖append前失败、flush结果未确认、权限重查、并发和非法项目列表；保存未知停止依赖业务并由重开菜单核对，不自动重试或重放。客户端0.5.0保持协作协议v3／附件v1，服务器模型不在本轮验收范围。补充新旧接口并发、保存／路由能力缺失及未知状态保持禁用回归，当前选中／映射锁／未知状态以DOM快照复核。打包附带源码、测试和固定依赖快照（pnpm会过滤根lockfile），抽取目录重跑完整测试与链接审计，完整检查通过90单元／26集成（0失败、0跳过）及命名／链接审计；独立抽取包通过116项全量测试及83个文档链接／97个内部导入审计，交付hash另记，固定Node24.21.0／pnpm11.7.0，不安装或修改真实GUI/profile／配置／服务器，不使用subagent。一次抽取包试验遗漏HOME／USERPROFILE隔离，7项回归因用户保存选择干扰失败；该启动路径可能执行成员SQLite初始化（新增日志表、设备／旧项目归属补齐、running提交标记unknown），没有读取实际库确认影响。已修正独立主目录后重验，不清理／回滚真实库、不声称该库完全未动；该次连接均被fixture替代，未调用真实SSH／模型／消息。详见[菜单指南](<PROJECT-MENU.md>)与[已确认设计](<设计确认-模型菜单项目选择.md>)。

## 0.4.2 登录连接诊断／终止顺序修复（本地，真实根因待现场证据）

用户截图已证明0.4.1本机配置可读，但点击扫码报Connection ended。隔离真实按钮→官方RPC→成员Host／MemberClient→SSH流先红，确认stdout EOF掩盖stderr／exit；0.4.2修复有界等待与分类、阶段、退出码诊断，不自动重试、不泄露原始stderr／token／proof。真实本地子进程覆盖关闭顺序、正常握手／登录链接、非法stdout；不执行SSH或网络。支持认证、指纹、网络、connector、socket与版本错误分类，无法识别明确未知，不冒充现场登录已修复。

详见[登录连接诊断](<LOGIN-CONNECTION-DIAGNOSTICS.md>)。未获取该次真实SSH stderr／服务器日志，实际连接根因未验收；未安装／刷新现用GUI，未修改profile／配置／密钥／服务器，未真实SSH、扫码、模型或消息调用。Windows / Node24.21.0 / pnpm11.7.0冻结依赖、**79单元 + 25集成**、命名／链接审计通过；最终包验证以本次交付为准。

## 0.4.1 本机状态RPC修复（历史本地，未重装现用GUI）

0.4.0用户截图与官方编解码链路回归证明：Host使用data而官方Connection成功结果使用value。先在真实官方caller／Host共享Fetch路由复现数据丢失，再在官方设置壳复现红字；0.4.1最小统一value并补充失败诊断。此前0.4.0测试通过只证明了菜单／渲染与RPC替身，不足以证明真实本机状态可读取，不能把旧结论当此故障已经验收。

新验证使用真实成员Host组件与配置解析、官方Connection编解码、Host共享Fetch路由、官方加载器／设置壳／模型选择器：状态显示具体服务／账号／来源；配置、登录／退出、项目绑定均经过此链路；旧响应与HTTP404明确诊断。传输进程内桥接、Host入站凭据和远端钉钉授权为fixture，不启动服务器、不访问真实SSH。抽取包执行相同状态渲染／项目绑定／操作及诊断检查。本机Windows / Node24.21.0 / pnpm11.7.0冻结依赖通过；**59单元 + 18集成**通过，命名／内部导入／文档链接审计通过。最终hash和抽取包／联合结果以本次交付为准。

未安装或刷新现用GUI、未修改用户profile／成员配置／Linux，未真实扫码、SSH、模型或消息调用。详细原因、旧测试缺口及复测步骤见[RPC修复记录](<LOCAL-STATUS-RPC-FIX.md>)。

## 0.4.0 自动发现与设置版（历史本地结果，真实RPC状态缺口见上文）

Windows / Node24.21.0 / pnpm11.7.0，以本仓固定官方依赖、隔离home和测试服务验证：

- 原四项需求回归先红（发现子目录、bundle默认启用、设置／会话分离、模型显示名称），修复后通过。
- 冻结依赖安装无需生命周期脚本；**59单元 + 14官方接口／DOM集成**通过，代码／文档链接与命名审计通过。
- 官方bundle补丁语义→真实Host Loader挂载，组件默认ACTIVE、浏览器图可见；用户后置明确禁用会撤回组件、路由和图。启动没有SSH或登录。
- 官方ClientModuleRegistry／ClientModuleSystem→Cordis entries.start→SlotRegistry→官方设置壳，在JSDOM中实际点击设置侧栏，验证“协作服务”身份面板和卸载／再加入，不只是检查注册记录。
- 官方buildModelCatalog／ModelDirectoryResolver／ModelSelect点选“Collaboration → 项目选择”，只在当前会话显示项目区；此前不查远端项目，切回普通模型隐藏。展示原语为测试替身，非现用GUI像素验收。
- 链路测试发现项目区状态Hook必须传selector；修复实际渲染崩溃并保留断言。补充快速双点击、待扫码切换锁、配置导入边界、配置变化后恢复／绑定失败关闭、重复扫描不绕过明确选择及SQLite打开失败，均先红后修复。
- 设置选择优先旧配置、恢复自动模式、指纹变更／丢失不换账号；切换忙／登录guard、同库跨账号项目归属、重启选择、旧mapping不迁移／重放通过。
- 显式联合协议契约 **1项**、分离后的联合React UI **1项**通过，仅测试文件与本地依赖，不修改服务端运行代码或Linux部署。
- 包校验器补齐标准PAX长／中文路径支持，保留checksum、穿越、重复条目和链接拒绝测试；包检查对抽取代码重新执行官方设置／当前会话项目DOM，核对新源码、浏览器构建和默认bundle字节一致；最终tgz/hash见本轮交付说明，不覆盖0.3.1安装包。

未发布GitHub新标签，未安装／刷新现用GUI，未修改用户profile或成员JSON，未读私钥正文、真实扫码、SSH、调用模型或发送消息。禁止使用subagent，全程未委派。具体设计见[确认记录](<设计确认-自动发现与设置.md>)，当前用法见[安装说明](<INSTALL.md>)。以下旧版本验收仅保留历史。

## 0.3.1本地Web启动修复（未发布／未重装现用GUI）

真实崩溃日志显示浏览器组合脚本第一行含Node ESM import，报 `Cannot use import statement outside a module`，随后 `web boot: 1 entry did not activate`。新增清单选择回归和官方DSH0.2.0-rc.2ClientModuleRegistry／ClientModuleSystem回归先红，修正 `./client` 指向浏览器构建产物后通过；Node MemberClient分离至 `./member-client`。包校验也对抽取包走相同官方路径，构建检查禁止误指Node入口，CI打包阶段独立构建。具体结果及限制见[修复记录](<CLIENT-BOOT-FIX.md>)；下述已发布版本结果保留历史，不能冒充本轮GUI／平台验收。

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
