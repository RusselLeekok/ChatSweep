# 开源方案调研与技术决策

调研日期：2026-07-29

## 对比结论

| 项目 | 覆盖范围 | 删除方式 | 优点 | 主要问题 |
| --- | --- | --- | --- | --- |
| qcrao/bulk-delete-chatGPT | ChatGPT | DOM 复选框 + 原生菜单点击 | 使用路径短；点击确认后只等待确认按钮消失，不等待侧栏行消失 | 仍依赖 ChatGPT 的 DOM 和原生单实例确认框 |
| imsomdev/bulk-delete-convo | ChatGPT | `/api/auth/session` + Sentinel + `PATCH conversation/{id}` | 给出了当前 Sentinel 请求头，绕过原生确认框 | 删除循环仍为逐条 `await`，每条额外等待 0.5–2 秒 |
| cecilialeung05/chatgpt-archive-delete | ChatGPT | 会话令牌 + 内部接口 | 删除和归档速度快 | 依赖未公开接口与令牌，兼容和隐私解释成本高，只有少量提交 |
| johnvouros/ChatGPT-bulk-delete-chats | ChatGPT | 内部接口优先，DOM 回退 | 有能力探测、安全模式、本地缓存和结果验证，防故障设计最好 | 仍按 ID 串行，并等待侧栏行消失后才继续 |
| Nagi-ovo/voyager | Gemini、ChatGPT、Claude 等 | 平台模块 + 原生菜单点击 | 站点模块成熟，SPA、虚拟列表、进度和诊断处理全面 | 功能和体量远超本产品需求，GPL-3.0，不适合直接复用到轻量独立扩展 |
| Azurboy/deepseek-voyager | DeepSeek | 多级选择器，偏聊天整理 | 提供 DeepSeek 稳定 URL 规则和降级选择器思路 | 已停止维护，批量删除不是核心能力 |
| Rex16200513/Better_Doubao | 豆包 | DOM 增强 | 给出豆包侧栏根节点和聊天 URL 结构 | 没有原生批量删除实现 |

## 最佳方案

采用“声明式站点适配器 + 前台原生快速队列”的统一架构：

1. 每个平台独立声明聊天行、菜单按钮、删除动作、确认弹窗和聊天 ID 规则。
2. ChatGPT 在前台依次执行“打开菜单 → 点击删除 → 点击原生确认”。
3. 点击确认后，只等待本次确认按钮或确认框关闭，立即进入下一条；不等待上一条
   从 React 侧栏消失。
4. 全部原生确认完成后，再统一核对所有目标是否从侧栏移除。
5. 其他平台使用同一安全执行器，并保留各自独立选择器。
6. 执行前运行兼容性探测；找不到可靠入口时进入安全模式。
7. 所有处理留在浏览器内，不读取登录令牌，不连接自建服务器。

## 为什么不使用 ChatGPT 内部接口

内部接口速度更快，也能绕过虚拟列表，但会带来四个问题：

- 接口、令牌获取方式和请求结构都未公开，变化不可控。
- 每个平台认证机制不同，跨站实现会显著增加敏感权限与审核说明。
- 请求成功不等于界面状态正确，仍需额外同步和失败恢复。
- 浏览器商店要求权限和用户数据用途与单一公开功能严格对应。

用户需要在前台看到原生删除过程，而不是后台静默删除。参考
`qcrao/bulk-delete-chatGPT` 的实现，原生队列不必等待侧栏行消失：确认删除按钮
关闭即可开始下一条。因此可以兼顾可见过程与更快的队列推进，同时避免依赖未公开
接口和登录令牌。

## 维护策略

- 每个平台使用独立 HTML 夹具测试选择器和文本匹配。
- 在真实登录页面记录兼容性报告，报告只包含命中的选择器和数量，不包含聊天标题。
- 选择器变更只修改对应适配器。
- 默认失败关闭。没有足够置信度时不执行删除。

## 参考项目与规范

- [qcrao/bulk-delete-chatGPT](https://github.com/qcrao/bulk-delete-chatGPT)
- [cecilialeung05/chatgpt-archive-delete](https://github.com/cecilialeung05/chatgpt-archive-delete)
- [johnvouros/ChatGPT-bulk-delete-chats](https://github.com/johnvouros/ChatGPT-bulk-delete-chats)
- [Nagi-ovo/voyager](https://github.com/Nagi-ovo/voyager)
- [Azurboy/deepseek-voyager](https://github.com/Azurboy/deepseek-voyager)
- [Rex16200513/Better_Doubao](https://github.com/Rex16200513/Better_Doubao)
- [Chrome Manifest V3 权限声明](https://developer.chrome.com/docs/extensions/mv3/declare_permissions)
- [Chrome Web Store 用户数据政策](https://developer.chrome.com/docs/webstore/user_data)
