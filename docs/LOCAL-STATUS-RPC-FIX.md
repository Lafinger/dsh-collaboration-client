# 0.4.1：设置页本机状态RPC响应格式修复

## 用户症状与根因

用户安装0.4.0后截图显示设置侧栏和“协作服务”面板已经出现，但来源为“尚未选择”、连接配置停在“正在读取本机配置”，底部报“无法读取本机协作状态，请检查插件组件与DSH连接”。这不能直接归因于成员JSON损坏，也不是设置槽未注册。

0.4.0的Host RPC成功响应为`{ok:true,data:...}`，浏览器半部也读取`result.data`。官方DSH0.2.0-rc.2Connection契约实际为`{ok:true,value:...}`；官方浏览器编解码器只从`result.value`重建成功结果。因此请求虽HTTP200并成功到达Host，数据在解码边界变为undefined，页面refresh失败且被通用提示隐藏。

旧设置／模型DOM集成使用了`connection.rpc.call`替身，该替身直接返回错误的data形状；旧Host RPC单测也只直接读取原始JSON，同样认可错误形状。两端测试共用同一个错误假设，未覆盖真实通信编解码边界。这是本轮修复的关键，而不是继续添加仅有菜单存在的断言。

## 先红的复现与修复

- `node --test test/official-member-rpc.integration.mjs`：官方浏览器Connection caller→真实HostConnectionService共享Fetch路由→原Host RPC；结果ok为true但value为undefined，断言先失败。
- `node --test test/official-settings-dom.integration.mjs`：加载真实成员Host组件、真实配置解析／SQLite、官方浏览器Connection、ClientModuleSystem／Cordis／SlotRegistry和官方设置壳；实际点击协作服务，同样出现用户截图红字。症状布尔断言先红，避免输出整个DOM对象。
- 最小修复：所有Host成功响应使用value，浏览器所有消费使用value。不放宽Host／同源／登录／项目授权，不修改成员JSON／profile或业务协议。
- 格式不兼容或HTTP错误时明确显示诊断，并结束假加载、清除旧状态、禁止以未核验状态发起登录／切换；HTTP状态码保留，原始传输异常不回显。

## 新回归覆盖

- 官方编码／相关ID校验与Host共享Fetch路由真实运行，状态数据不能被丢掉。
- 官方设置壳断言具体服务／成员账号、自动发现来源和候选项，不仅菜单／面板存在；图卸载和重载保留。
- 官方模型选择器点选后，项目列表和当前会话项目绑定也经过同一编解码链路，绑定写入真实本机SQLite，不产生业务消息。
- 选择／导入／恢复自动模式／刷新、开始／领取／退出设备登录、项目查询／绑定，全部成功value经官方解码检查。远端授权使用协议fixture，不真实连接SSH或扫码；token／proof不返回浏览器或选择状态。
- 旧data响应、缺Host路由分别明确格式不兼容／HTTP404，不继续显示正在读取。
- 打包检查在抽取包上加载真实Host与浏览器代码重跑以上设置／项目／操作／诊断链路，防止只验证源码不验证交付内容。

## 复测步骤与边界

使用0.4.1本地tgz升级，**完全重启DSH并刷新Web页面**，先只打开设置 → 协作服务：核对连接来源、服务／账号与候选项，确保不再出现读取失败，暂不扫码／发消息。无需删除状态库、改profile或编辑原JSON。若仍失败，提供组件版本、截图和新的明确错误文本。

本轮隔离验证没有启动替代Web服务，未访问或修改现用profile／成员配置／密钥／Linux部署，未真实扫码、SSH、调用模型或发送消息，也未发布GitHub新标签。Host路由及浏览器编解码器真实运行；网络以进程内Fetch桥接、Host入站凭据以测试替身提供，不代表现用浏览器cookie或真实平台已经验收。
