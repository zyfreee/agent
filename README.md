# 斗破同人 Agent · SillyTavern 扩展

这是一个可安装到 SillyTavern 的浏览器扩展，用于承载“斗破同人 Agent”的运行反馈、任务状态和后续宿主事件接入。

## 当前功能

- 标准 SillyTavern 扩展清单和生命周期钩子；
- 顶部 **Agent 设置**按钮，打开一个单例设置面板；
- LLM 连接设置：连接方式、是否使用酒馆当前连接、接口地址、模型、温度和最大输出；
- Agent 功能开关：原著资料查询、行动结算、世界运转、NPC 自主决策、玩家影响与世界演变；
- 运行预算、调试和运行反馈设置；
- 设置自动保存到 SillyTavern 的扩展设置命名空间，不写入聊天消息；
- Agent 任务状态运行反馈面板；
- SillyTavern 宿主能力预检；
- Agent 核心模块的离线测试。

设置面板是配置入口，LLM 实际请求链仍需接入总控和目标模型能力。模型生成、真实聊天消息链、不同酒馆版本的事件时序仍需在安装后逐项验证。

## 安装

1. 打开 SillyTavern 的 **扩展** 面板。
2. 选择从 Git URL 安装。
3. 填入：

   ```text
   https://github.com/zyfreee/agent.git
   ```

4. 安装完成后刷新页面，或重启 SillyTavern。
5. 在扩展列表中确认“斗破同人 Agent · 运行反馈”已出现并启用。

扩展入口是仓库根目录的 `manifest.json`；入口脚本和样式位于 `agent/doupo-agent-ui/`，标准设置模板位于仓库根目录 `settings.html`；入口目录另有一份相同内容作为相对路径备用模板。不要把仓库再套一层目录后手动移动文件，否则 `third-party/agent` 模板路径可能失效。

## 使用与排错

安装后先打开浏览器开发者工具的 Console，再刷新 SillyTavern。若扩展没有出现，请提供：

- SillyTavern 版本；
- 安装方式和安装后的扩展目录；
- Console 中从扩展加载开始的完整错误；
- 扩展管理器中显示的状态。

目前仓库中的离线测试只证明模块逻辑和设置模板结构通过，不代表已经在你的酒馆实例中完成安装和运行验收。

## 设置栏目使用

扩展启用后，在酒馆顶部栏（若目标版本没有顶部栏，则回退到扩展菜单或页面底部）会出现 **Agent 设置**。点击后可切换“总览 / LLM / 功能模块 / 运行预算”四个分区；输入变化会自动保存。API Key 仅作为扩展设置保存，不会插入聊天内容、提示词或审计日志。

当前设置只提供统一配置和模块调度开关，不会替你自动创建模型连接，也不会把“模型已返回”当成“状态已保存”。

## 开发检查

在仓库根目录运行：

```text
node agent/doupo-agent-ui/run-tests.mjs
node %USERPROFILE%/.dsh/skills/sillytavern-extension-dev/scripts/validate-extension-manifest.mjs --root .
```

## 依赖与兼容性

- 运行环境：浏览器端 SillyTavern UI 扩展；
- 清单最低客户端版本：1.18.0（使用生命周期 hooks）；
- 不需要服务器插件；
- 目标是当前 SillyTavern 发布版，但具体事件 payload、顶部栏选择器和扩展管理器行为仍以实际安装版本为准。

## 许可证

本项目采用 GNU Affero General Public License v3.0，见 [LICENSE](LICENSE)。
