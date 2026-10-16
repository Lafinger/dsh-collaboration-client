# 2026-10-16 新版页面／旧Host混载诊断

## 实际症状与分层

用户在现用DSH截图看到新版“HTTPS服务地址／电脑钉钉登录”，但状态和错误却要求“选择或导入成员连接配置”。服务端此时已经是正式`dingtalk-collaboration-mvp`，实际可信TLS／WSS和未登录拒绝边界通过，正式库尚无登录请求。因此不是官方钉钉API调用失败，也不应恢复旧JSON／SSH。

A实际安装包0.6.0、pnpm-lock精确指向成功CI提交`a0cda7cd4ddc5b7851d54d0e475ad5dd3d2a7976`；18个运行／UI文件仅Windows Git CRLF转换，pack元数据另省去packageManager字段，源码语义一致但不声称字节相同。19387实际后台进程启动于升级前，仍在内存使用旧MemberConnection；浏览器文件已经更新，形成前后半部不一致。仅刷新页面或停用再启用插件不可靠地驱逐模块缓存。没有手工覆盖已安装依赖、绕过Electron管理或另起GUI服务。

## 红／绿反馈环

[混载集成回归](<../test/mvp-host-upgrade.integration.mjs>)通过真实旧MemberConnection、真实官方Host共享Fetch路由、官方浏览器Connection编解码和DSH模块注册加载新版设置页。只有本机 admission 使用fixture，不读取用户登录凭据；没有外部网络、官方身份模拟确认、真实SSH或模型调用。

最初三项均红：旧Host状态直接把截图中的JSON导入提示渲染出来；旧Host若报authenticated甚至显示旧账号／Invalid Date；新MVP尚未保存地址时，登录拒绝仍落到旧导入文案。不是用假RPC字符串返回一个构造的成功结果。

最小修复：

- 新页面识别`configuration.mode === 'mvp-https'`或未配置状态的`source === 'https-mvp'`；旧配置只触发明确完整重启提示，不采用旧认证／成员状态。
- 混载时禁止保存地址、登录和退出旧设备，不展示旧已登录身份／管理区／核对码；刷新状态保持可用。事件处理自身亦检查，不能靠手动触发已禁用按钮绕过。
- 新MVP缺地址时后端只提示输入HTTPS地址，不要求导入JSON。历史测试入口仍保持自己的旧契约，不变成生产回退。
- 官方设置DOM回归改用真实默认HTTPS Connection，而非借用旧SSH测试fixture给新版界面提供“配置完整”的假前置；旧历史专项测试仍明确加载LegacyCollaborationPanel。

针对性九项回归由红到绿；本地完整check共101项测试＋32项集成通过（含真实Windows CurrentUser DPAPI合成秘密往返），显式指定同版本官方包族的双插件联合TLS回归2项通过。GitHub双平台CI仍须独立通过再分发固定版本；本地Windows结果不冒充Ubuntu结果。此修复不保证正在运行的旧Host自行热更新；仍须官方管理器安装已验CI版本后完整重启，并观察现用页面。

## 当前验收边界

服务器按固定成功CI提交`4c30cd2c52c0f1d02697b044f2050a6c8b3f6fd2`完成正式切换：新库空起、旧成员SSH关闭、旧OAuth404；隔离验证实例身份库与重复配置已退役，正式应用秘密和CPA保留。

A旧配置／密钥／映射等6叶已清理，唯一实际找到的旧专属Host会话因锁拒绝而尚未删除；其他普通会话未动。B用户报告在B清理5叶并安装新版本，还不能等同独立的B清理后核验。

用户报告A／B都显示新版界面，但**正式现用GUI本人登录／DPAPI重启记忆、B角色候选、管理员新项目、最小业务链仍待验收**。隔离A实际PC登录通过与B网络通过都不替代此门槛。此公开记录不含设备proof、token、授权码、应用秘密或聊天正文，不是业务备份。
