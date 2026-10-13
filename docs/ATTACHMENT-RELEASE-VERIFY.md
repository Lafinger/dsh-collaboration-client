# 客户端v0.3.0附件工具正式发行验收

## 正式发布与安装

- release commit `8eec6b57479266c7c87eaccacab013e4391c176a`，annotated v0.3.0；旧标签/附件不改，不npm/市场发布。
- [main双平台CI](https://github.com/Lafinger/dsh-collaboration-client/actions/runs/38354236501)、[tag CI与自动Release](https://github.com/Lafinger/dsh-collaboration-client/actions/runs/38354421798)success，Windows/Ubuntu验证及package通过。
- [公开v0.3.0](https://github.com/Lafinger/dsh-collaboration-client/releases/tag/v0.3.0)非draft/prerelease，tgz/SHA256SUMS/release.json三附件；下载tgz SHA256 `ae5a040214da00ce050280f159546266a47423ade8dc592f1f00e5fc6f34944a`与发布manifest一致。
- 实际下载24文件包抽取安全import PASS；固定GitHub来源独立安装与官方host待配置安全挂载PASS（不SSH/模型）。真实DSH CLI安装至专用disabled `collaboration-compat-attachment-client-v030` profile PASS，无版本豁免，现用desktop/acp不改。

## 回归与边界

31客户端单元＋8宿主集成PASS；对真实llm waterfall的原生file引用捕获在占位符投影之前，归一化image source准确记录，文字placeholder不给权限。当前human单独操作行/唯一project_id、工作区边界、密钥路径拒绝、hash/大小/数量、跨session/request句柄、取消、未来/无附件capability拒绝、旧消息无重放都有负例。双仓joint4项PASS，实际官方Agent与forced connector多块transfer/inspect/archive/原生+path/同名新版本/同id恢复，无真实网络模型。

服务端最终v0.4.1：v0.4.0实际POC Word本地结构兼容检查发现空ZIP目录有反斜杠；服务端新patch只允许安全空目录标记不解压，文件路径逃逸仍拒绝，旧v0.4.0不覆盖。客户端不需再升版，附件扩展1完全相同。

## Docker保留升级与真实SSH

- 服务器固定GitHub v0.4.1/commit c90bba68b2987f6af80f5ccece809d6a5743f055；镜像dsh-collaboration-linux-sim:0.4.1，healthy/Restarts0，原卷保留。
- 升级前离线保存opaque hashes/计数而非数据库或credential复制；升级后原30业务表/全部access记录/6宿主会话文件/原件资料/Codego与成员和SSH身份逐项一致。2项目（CSAIR-DH-POC/COLLAB-RETEST-001）、3远端会话、9access请求保留；未清库、未迁移mapping、未轮换key、未自动prompt。
- 下载发行客户端通过当前真实用户配置SSH initialize/whoami/现有POC历史PASS，附件扩展1与服务0.4.1精确协商；跨成员历史/通用filesystem/未来attachment版本拒绝，无session/new或模型请求。
- 本机Alice/Bob两个身份及127.0.0.1/LAN192.168.2.27/ZeroTier10.242.14.211路由协商PASS，同一host PID；不宣称本次另一台实际设备GUI已测试。
- 新镜像隔离无network/无生产volume官方host工具fixturePASS，PNG/JPEG/WebP/GIF native加载/首帧校验、资料immutable归档及same-id恢复无重放；生产模型route不发送测试prompt。

## 用户仍需执行

两台手工重装固定 `github:Lafinger/dsh-collaboration-client#v0.3.0`，保留配置/mapping/key/known_hosts、打开原会话，不重发旧消息。Alice按[附件指南](<ATTACHMENTS.md>)主动传真实文档和分析归档，Bob只读核对固定版本。真实文档已获准当前Codego处理，但本轮自动工作**没有传输原文或调用真实模型**。GUI附件/真实模型/智能分类质量尚待用户人工验收，不根据fixture宣称已通过。
