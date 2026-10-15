# 0.3.1：DSH Web启动导入失败修复

## 用户范围

用户报告插件导致DSH无法启动，已卸载，并明确要求只修复插件、后续自行验证。本轮不重新安装、不改现用GUI/profile、不继续Linux部署或真实扫码、不启动机器人或发送消息、不调用模型，不使用subagent。

## 真实错误与最小复现

DSH Desktop0.2.0-rc.2崩溃日志（2026-10-14 08:30 UTC）在renderer console记录：

```text
dsh-collaboration-client/client.js:1
Uncaught SyntaxError: Cannot use import statement outside a module
web boot: 1 entry did not activate
dsh-collaboration-client: import failed (see console for the import error)
```

新增测试按package.json的 `exports["./client"]` 选文件，而不是直接读取已经构建好的浏览器文件；首次运行红：

```text
import { DatabaseSync } from 'node:sqlite';
SyntaxError: Cannot use import statement outside a module
```

随后使用固定官方 `@deepseek-ai/dsh-client-modules@0.2.0-rc.2` 的ClientModuleRegistry从同一Loader入口定位package.json，生成combo路由，通过ClientModuleSystem导入，仍重现同一语法错误。现用GUI没有参与测试，测试不读取登录凭据、SSH密钥、平台接口或业务数据库。

## 根因

包已构建浏览器产物 `lib/client.js`，但清单将DSH约定的 `./client` 错指向Node端 `src/member-client.mjs`，另设的 `./client-ui` 不会被DSH自动选用。

官方Host固定读取 `exports["./client"]`，作为classic-script组合脚本提供给浏览器。含Node ESM import的源码因此直接进入浏览器脚本，不是React版本／权限／服务器错误。

旧测试直接读取 `lib/client.js`，旧打包检查只确认exports对应文件存在及Host Node入口能导入，均遗漏了实际清单选择路径。因此之前“构建文件测试通过”不能代表Web启动通过。

## 修复

- 本地版本递增0.3.1；没有发布或覆盖0.3.0标签。
- `./client` 固定指向 `./lib/client.js`，遵循DSH浏览器契约。
- Node MemberClient分离至 `./member-client`；保留 `./client-ui` 浏览器别名。Node调用方须迁移 `/client` → `/member-client`，仓内无旧subpath调用残留。
- `dsh.client.external`显式声明浏览器require使用的react。
- 构建先检查清单出口，再以classic-script语法编译，拒绝误把Node文件交给浏览器。
- 单元回归同时覆盖清单选文件、官方Host注册表和组合脚本路由、官方浏览器模块materialization及独立Node API。
- tar抽取包也经过上述官方Host→browser路径，禁止错误出口或缺失MemberClient出口，不能只测Node main。
- CI package阶段在自己的checkout独立构建后打包，不依赖另一个job的构建副本。不添加prepare/install生命周期或版本豁免。

## 验证

- 修复前清单选择和官方Host→browser路径均失败，准确重现同一语法错误；直接读取正确构建文件的旧测试仍通过，证明此前验证层存在缺口。
- 修复后5项定向测试通过，包括官方初始combo仅加载一次、不进入失败重试路径，以及Node API独立可导入；阴性对照恢复原错误出口后官方加载路径必须失败。
- 冻结依赖／构建／完整单元40项／官方接口集成8项／审计全部通过，0失败、0跳过；新增官方客户端加载器仅为固定版本devDependency，不要求用户额外安装另一份Host。
- 三仓库联合6项通过，含真实React登录面板交互与实际Cordis业务链，但平台和模型使用明确离线模拟源。
- 修正版tar必须经过源码字节匹配、抽取包官方清单选择／组合脚本／ClientModuleSystem及Node main独立加载检查；结果由交付批次无秘密证据记录。原错误tar已在加强后的校验下被明确拒绝（实际 `./src/member-client.mjs` ≠ 期望 `./lib/client.js`）。

所有结果均是离线验证，不代表已重新安装用户GUI或完成真实扫码。

## 自行安装的边界

交付的0.3.1本地tgz用于后续安装验收。GitHub默认分支／v0.3.0标签未推送修复，重装旧来源不会获得本修复。实际安装、DSH重启／刷新、页面显示和扫码由用户自行操作；未声称现用GUI恢复通过。
