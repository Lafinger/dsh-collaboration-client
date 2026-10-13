# 客户端v0.2.0正式发布验收

## 提交与自动化

- 发行提交fa48e85749de19b54144da7c7ba635c8fec8c15c，带注释标签v0.2.0；旧v0.1.2标签未移动，旧附件不改。
- [main双平台CI](https://github.com/Lafinger/dsh-collaboration-client/actions/runs/38338931058)与[tag双平台CI/自动Release](https://github.com/Lafinger/dsh-collaboration-client/actions/runs/38339275066)均success；Ubuntu、Windows检查与单份Linux打包通过。
- [公开Release](https://github.com/Lafinger/dsh-collaboration-client/releases/tag/v0.2.0)非draft/非prerelease，三附件齐全；不发布npm或市场。
- 下载官方tgz、release.json、SHA256SUMS，包SHA256为d452bf2fe670232a268ddb0ec188c93a8980766c2635494ca1bd3f3985db1776，与元数据commit/tag一致；抽取20文件、entry/import/disabled bundle/MIT/安全挂载PASS。

## 安装与回归

固定入口：

```text
github:Lafinger/dsh-collaboration-client#v0.2.0
```

隔离pnpm从此GitHub tag安装官方精确peers、实际Cordis/LLM服务挂载插件PASS，空配置不连接SSH、不建库/注册协作模型。随后现用DSH0.2.0-rc.2真实installer接受下载发行tgz，仅写专用collaboration-compat-rename-client-v020 profile，默认disabled，不触碰desktop/acp；profile包管理器提示host-supplied peers不在自身树中，不用安装第二套宿主或版本豁免消除提示。

本地25单元+6官方接口集成+1显式联合契约PASS；双仓联合还包含3项服务器适配器/本地远端loop。协议helper/契约逐字节一致，协作v2拒旧/缺失/错误版本，基础ACP-shaped版本1保持。没有真实模型调用。

默认读取home/.dsh/dsh-collaboration-client/collaboration-client.json，无旧默认自动回退。isolated home测试确认旧文件不读取、新目录BOM JSON正常读取。命名审计区分真实来源与历史证据，不排除全部docs。

## 部署边界

服务器Linux模拟器已更新正式v0.3.0且清空业务/会话，不留备份；真实SSH新client测试两成员身份、跨成员历史拒绝、三本机地址、forced-command、错误密钥/协议版本拒绝PASS，最终清空临时测试会话，daily/0请求。见服务端正式仓库部署证据。

**用户自行卸载重装两台GUI插件并清理插件专用旧映射库。新版外部Bob GUI及实际模型业务尚未重新测试**，旧版GUI记录不能充当新版结果。不删除普通DSH历史、私钥、known_hosts；新建会话重测，旧会话远端记录已不可恢复。步骤见[连接安装](INSTALL.md)。
