# 0.6.1-test.20261021.1：手动安装测试构建（非正式发行版）

- 目标宿主：DSH 0.2.1-rc.2。旧0.6.0发行资产未覆盖，无新tag/release。
- 当前官方SDK与版本门禁回归已验证：旧0.2.0-rc.2声明被真实门禁拒绝，测试构建无需豁免通过。
- 已修复并验证角色分配写成功/后续读取失败的区分、未知写结果先核对不重发、临时忙碌释放、跨项目核对隔离及管理RPC断连/坏响应的保守分类。
- 下拉故障尚未证实修复：原始bundle在真实Chrome、当前发布宿主settings/renderer/primitives与CSS、隔离RPC fixture中，一次分配前后三个原生select均可鼠标展开（CSS :open与AX expanded均为true）。此结果是未复现，不是当前鉴权GUI验收通过。
- 全量官方集成的旧fixture需要适配新SDK浏览器导出与新增modules服务；尚未完成Windows/Ubuntu CI与当前GUI真人验收。本包仅供用户自行测试，不标为正式可发布版本。
- 本次不安装或修改现用GUI、profile、登录/设备、服务端、BOTTEST01项目角色或其他插件。用户截图中的archive-manager不兼容是独立问题，本包不修复它，也不使用allow-version豁免。
- 本地安装器支持绝对路径tarball；用户自行在插件安装入口使用提供的tgz绝对路径。若需恢复，使用此前确认的固定旧版包和相容宿主，不对数据库/业务做回滚。
