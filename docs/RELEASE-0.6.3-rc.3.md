# 0.6.3-rc.3 已选项目不再被追问「所属项目」预发布说明

## 固定安装与配套范围

固定安装源：

```text
github:Lafinger/dsh-collaboration-client#v0.6.3-rc.3
```

发行状态及三份已验证资产以[该tag的GitHub Release](<https://github.com/Lafinger/dsh-collaboration-client/releases/tag/v0.6.3-rc.3>)与对应Actions为准；发布不代替用户安装。原有tag与资产不移动、不覆盖。本插件只向GitHub发行，保留private:true，不发布npm或插件市场。

客户端要求DSH **0.2.1-rc.2**、Node **>=24**，构建与CI固定Node24.21.0／pnpm11.7.0及原lockfile。必须配套支持 `humanAuthorization.version:2` 的协作服务；基础协作协议v3、附件扩展v1保持不变。旧peer拒绝请求，不伪造旧授权模板、不降级传输。

安装后不自动创建项目、不改成员或对话归属，不清理既有设备登录。已有有效登录不需要为升级而退出或重新扫码。保留原会话映射、项目绑定和不自动重放业务的边界。

## 本版变化

- 修复：在**已选定项目**的会话中，用户说「这是**整个项目**的需求文档，你需要分析并上传。」时，助手不再反覆要求确认项目，而是按当前绑定项目正常处理附件。
- 根因：`src/human-intent.mjs` 的 `resolveHumanProject` 把「整个项目」当作指名的项目名去和受信名称比对，必然不匹配，从而误入澄清分支。这是解析层缺陷，与会话归属无关。
- 泛指当前项目的说法（整个／本／这个／那个／该／此／当前／目前／本次／这次／我们／咱们 + 项目，以及裸「项目」）现在视为**指代已绑定项目**。
- 保守边界保持不变：真实近似名（如「南航数字人POC」之于「南航智慧出行数字人POC2」）、无关名称仍澄清；指名另一个真实可见项目仍拒绝抢占当前会话；精确项目名与项目键照常解析。

## 验证与验收边界

- `test/human-intent.test.mjs` 52/52 通过，新增用例覆盖泛指说法放行、全链路 `interpretAttachmentRequest` 产出 `read` 且 `archiveAuthorized:false`，以及近似名／无关名／跨项目冲突仍被拦住。
- 本地全量门禁 **exit 0**：190/190、88/88，`fail 0`。
- 同时修复服务端同源副本（`dsh-collaboration-acp-server` 的 `src/human-intent.mjs`），两侧需配套升级；仅升级一侧不会让用户看到的现象消失。
