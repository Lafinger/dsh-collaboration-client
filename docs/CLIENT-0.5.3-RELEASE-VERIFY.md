# 客户端v0.5.3正式GitHub发行验收

## 固定版本与线上证据

| 项目 | 结果 |
| --- | --- |
| 公开源提交／v0.5.3标签指向 | `2bca2ed97e548459da36300c0ade2e268128e811` |
| main双平台CI | [38681223779](https://github.com/Lafinger/dsh-collaboration-client/actions/runs/38681223779)，success |
| tag双平台／发布CI | [38681427108](https://github.com/Lafinger/dsh-collaboration-client/actions/runs/38681427108)，success |
| 公开正式Release | [v0.5.3](https://github.com/Lafinger/dsh-collaboration-client/releases/tag/v0.5.3)，非draft、非prerelease |
| 包大小 | 172420字节 |
| 正式下载包SHA256 | `69423b2060c2aa3cd3eb3a9451a885cd0bda6f1644aaf0fec4a7072f9300d5b9` |
| 发布范围 | 仅GitHub，不发布npm或DSH插件市场 |

Release附带[正式包](https://github.com/Lafinger/dsh-collaboration-client/releases/download/v0.5.3/dsh-collaboration-client-0.5.3.tgz)、[SHA256清单](https://github.com/Lafinger/dsh-collaboration-client/releases/download/v0.5.3/SHA256SUMS)及[发行来源清单](https://github.com/Lafinger/dsh-collaboration-client/releases/download/v0.5.3/release.json)。从公开Release重新下载、独立计算摘要，结果与GitHub资产digest及两份清单一致。安装来源为`github:Lafinger/dsh-collaboration-client#v0.5.3`；本验收是后续文档补记，不移动标签、不替换公开发行附件。

## 功能保留与回归

- 包含原0.5.2全部项目菜单、0.5.1远端依赖注入修复和原生模型触发按钮样式；没有回退独立项目区或旧菜单。
- 新增GIF名称、声明类型、魔数禁传，在生成上传授权前拒绝；服务端重复执行GIF拒绝，不提取首帧、不自动转换。原生PNG／JPEG／WebP和显式路径附件均保留原传输协议。
- Windows Node24.21.0／pnpm11.7.0完整check：94项单元＋27项集成通过，102个内部导入／104个文档链接与命名审计通过。
- 对**公开下载包**独立抽取106文件，逐字节匹配发行源提交（仅固定pnpm的manifest归一化）；121项单元／集成通过，0失败／跳过。官方ModuleRegistry／ModuleSystem／Loader／renderer、modelDirectories可追踪Service、原生按钮CSS／SVG、项目菜单状态、Host编解码／路由组装等隔离回归通过。
- 本机另打包的归档可能因时间戳／元数据具有不同摘要，不能用其hash代替上表的正式下载包hash。原0.5.2包未覆盖，其SHA256保持`6b64920dcd5d4a1b25cb323bbaa0e1c0f2fe2f6c11fb9b1f82d67815a0d14deb`。

## 配套Ubuntu与验收边界

服务端0.5.0已按[固定成功SHA的Ubuntu验收记录](https://github.com/Lafinger/dsh-collaboration-acp-server/blob/main/docs/CPA-UBUNTU-VERIFY.md)切换至CPA／gpt-6.1-sol，保留现有钉钉、业务、资料、会话、HTTPS和成员SSH，真实模型门禁仍关闭。本机已有成员密钥在19482真实SSH握手取得0.5.0／协议v3，扫码前项目访问仍拒绝，未发起设备登录或业务／模型请求。服务器CPA key不下发客户端，成员配置无需随供应商变化修改。

**本轮没有代装、重启或刷新现用GUI。** 离线DOM／CSS、官方模块和请求组装结果不等于现场GUI像素／升级验收；没有新一轮钉钉扫码、机器人消息或真实文本／图片模型验收，也未验证CPA key有效性和网关兼容。需要实际模型验证时另行明确授权，不以本次发布自动打开服务端门禁。

安装后由用户完全重启DSH并刷新Web页面，确认Host和浏览器版本一致，按[安装步骤](<INSTALL.md>)和[项目菜单指南](<PROJECT-MENU.md>)人工复测；不要删除原成员库／映射、重放旧请求或发送旧消息作检查。全过程无subagent／workflow，本地成员私钥、配置、真实库和DSH安装未被发布步骤改写。
