# 会话与恢复规则

- 一个本地会话对应同一 serviceId/account 下的一段远端会话，映射持久保存。
- 同一本地消息的稳定 messageId 只能提交一次；网络超时或断线不意味着服务端未执行。
- 自动重连仅执行 initialize、身份确认、session/load 与 collaboration/history，不调用 session/prompt。
- 恢复失败保留旧 mapping，明确报错，不静默新建会话，不把历史当用户指令重放。
- 已保存但未呈现的远端记录作为本地 plugin-source notice 显示；不是新的 human-source 消息。
- 标题只在本地截取文本；其他辅助模型调用明确拒绝，不能调用远端业务 Agent。
- 断线取消当前会话的一轮；已提交数据保留，其他成员不受影响。
- 同一远端会话不允许多客户端同时附加；一个账号可有多个独立会话。

## 提交结果未知

客户端本地标记 `unknown` 表示不能证明上一轮是否完成；它不是待自动补执行的任务。先恢复保存记录，再由成员明确提出新的继续请求。稳定 requestId 只防 transport 重发，并不保证任意业务副作用全局 exactly-once。

本地状态库含对话映射与标识，应按成员私有数据保护；服务端 account 签名秘密从不进入客户端代码或配置。详见[通信契约](PROTOCOL-v2.json)。
