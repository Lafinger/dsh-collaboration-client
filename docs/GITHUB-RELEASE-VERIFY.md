# GitHub 首版验收记录：v0.1.2

## 已完成

- 实现/推送提交：`71698ed429ca6d5c8ba5eebd6bec7f3b7f97f428`；此前客户端0.2兼容和安全待配置两次修复也已一起推送。
- [main CI](https://github.com/Lafinger/dsh-collaboration-client/actions/runs/38222243259)：success；Windows、Ubuntu、打包成功，Release job按设计跳过。
- [v0.1.2 标签发布](https://github.com/Lafinger/dsh-collaboration-client/actions/runs/38222511883)：success；双平台检查、打包、GitHub Release四个job均成功。
- [GitHub Release](https://github.com/Lafinger/dsh-collaboration-client/releases/tag/v0.1.2)：已公开、非draft、非prerelease；仅GitHub发布。

## 真实安装来源验收

```text
github:Lafinger/dsh-collaboration-client
github:Lafinger/dsh-collaboration-client#v0.1.2
```

两种来源均用本机真实 DSH0.2.0-rc.2 installer 安装到专用`collaboration-compat-github-*` profile，退出0，package/bundle注册成功。默认分支额外验证了不带`--ignore-scripts`的普通安装，也成功。安装副本使用实际应用内官方模块挂载，状态configuration-required，不创建MemberClient、不启动SSH。

独立pnpm来源安装+挂载脚本也通过默认分支与固定tag两种来源，不读取原业务仓库。git-hosted来源在ignore-scripts场景有“可能需要构建”的提示，但包无prepare/install构建，脚本禁用下实际导入挂载成功；普通DSH安装没有要求额外构建批准。profile中host-supplied peers提示不等于版本不兼容；未安装第二套宿主来消除提示。

## Release 附件

- `dsh-collaboration-client-0.1.2.tgz`
- `SHA256SUMS`
- `release.json`

下载实际Release附件并检查包内部入口、相对import、bundle默认禁用、空模板及抽取导入：PASS，18文件。SHA256：

```text
4b198a3a8549c59d24232f392cc9ff6890c3ebe269da75cf5b251edeec3b199a
```

release.json中的commit等于标签提交；registryPublication和marketPublication均false。对真实公开Release使用下载的同一份附件重跑发布脚本：PASS，仅读取并比较现有附件，无覆盖/重新上传。Linux构建包hash不要求等于Windows本地打包hash，下载附件以随包校验文件为准。

## 测试和权限边界

本地21项单元测试+6项集成测试通过；线上双平台相同check通过。发布策略测试和API替身覆盖首发、相同产物重跑、不同附件拒绝覆盖、公开版本不补改附件。首发时源库维持private:true和UNLICENSED（历史事实；当前main后续已改为[MIT许可证](../LICENSE)，未改动已发布附件）；未执行npm publish、npm认证配置或市场投稿。

实际验证只创建专用profile；未改现用desktop/acp配置、服务器代码或业务库。真实GUI交互、Linux SSH隔离与模型业务连通仍未验收。发行版安装不等于已经配置或连上服务；后续步骤见[连接配置](INSTALL.md)。

本验收文档在发布后单独提交到main，不移动v0.1.2标签或修改已发布附件。
