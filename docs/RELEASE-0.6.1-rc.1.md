# dsh-collaboration-client v0.6.1-rc.1（预发布）

本版本是GitHub预发布，不是稳定版，不发布npm或插件市场，不覆盖既有发行资产或先前交付的0.6.1-test.20261021.1本地测试包。

## 目标与变化

- 固定验证DSH **0.2.1-rc.2**、Cordis 4.0.5、Schemastery 3.18.5、React 18.3.1；不使用版本豁免，不宣称支持所有历史/未来宿主。
- 修复旧0.6.0精确声明DSH 0.2.0-rc.2而被当前宿主拒绝的问题，执行真实官方兼容门禁、模块加载与完整SDK集成，不只是改版本字符串。
- 角色分配写入成功、后续读取失败时明确区分已保存状态；未知写结果先只读核对，不自动重发。控件在请求结束后恢复可操作，待核对时阻止重复分配。
- 保留显式读取、明确确认、成员空缺与跨项目未保存选择隔离；管理项目切换不改变协作对话项目归属。
- 当前SDK测试设施适配正式browser导出、settings新增modules依赖、Host已准入peer、SessionController资源注册与模块图release身份。不跳过失败测试，不削弱权限或发布门禁。

## 验证与边界

- 本地完整门禁：**138项单元测试、34项官方集成测试**全部通过，另含语法、打包浏览器边界、导入/链接审计与命名检查。
- 用户自装前一测试构建并逐步确认启动/设置、分配前下拉、一次保存后下拉、连续第二次保存、跨项目草稿隔离全部成功，见[真人验收](<CLIENT-UI-ACCEPTANCE-2026-10-21.md>)。
- 原始bundle在真实Chrome+当前发布宿主设置/renderer/primitives/CSS隔离场景中也未复现原生下拉故障，因此**本次正常操作通过不等于旧故障根因已定位**，不宣称任意环境永不复发。
- 保存失败/断连/坏响应等异常路径为自动化覆盖，不伪称用户现场故障注入。未修改宿主、服务端、既有BOTTEST01角色、设备登录或会话历史。
- GitHub Windows/Ubuntu验证和打包是发布前强制门禁；仅在两端及打包通过、标签匹配包版本且位于main后，流水线才创建预发布Release。最终远端结果以对应Actions运行为准。
- 其他第三方插件（例如archive-manager）的独立兼容错误不在本包修复范围。

## 安装地址（对应Release成功后使用）

```text
github:Lafinger/dsh-collaboration-client#v0.6.1-rc.1
```

Release页面：<https://github.com/Lafinger/dsh-collaboration-client/releases/tag/v0.6.1-rc.1>。

用户自行安装，代理不安装或重启。安装前核对目标DSH与Release状态；使用固定tag或已核验的tgz，不把默认分支当成最新Release，不使用allow-version绕过兼容检查。安装不等于服务已连接或成员已认证。

发布附件由同一已验证提交构建，包含tgz、SHA256与元数据；既有tag/公开附件不重打、不覆盖。
