# 斗破同人 Agent · SillyTavern 扩展

这是一个可安装到 SillyTavern 的浏览器扩展，用于承载“斗破同人 Agent”的运行反馈、任务状态和后续宿主事件接入。

## 当前功能

- 标准 SillyTavern 扩展清单和生命周期钩子；
- Agent 任务状态运行反馈面板；
- SillyTavern 宿主能力预检；
- 扩展设置和当前聊天 Agent 状态的宿主存储适配；
- Agent 核心模块的离线测试。

当前版本先保证可以安装和加载。模型生成、真实聊天消息链、不同酒馆版本的事件时序仍需在安装后逐项验证。

## 安装

1. 打开 SillyTavern 的 **扩展** 面板。
2. 选择从 Git URL 安装。
3. 填入：

   ```text
   https://github.com/zyfreee/agent.git
   ```

4. 安装完成后刷新页面，或重启 SillyTavern。
5. 在扩展列表中确认“斗破同人 Agent · 运行反馈”已出现并启用。

扩展入口是仓库根目录的 `manifest.json`；入口脚本和样式位于 `agent/doupo-agent-ui/`。不要把仓库再套一层目录后手动移动文件，否则相对路径可能失效。

## 使用与排错

安装后先打开浏览器开发者工具的 Console，再刷新 SillyTavern。若扩展没有出现，请提供：

- SillyTavern 版本；
- 安装方式和安装后的扩展目录；
- Console 中从扩展加载开始的完整错误；
- 扩展管理器中显示的状态。

目前仓库中的 `31/31` 测试只证明离线模块逻辑通过，不代表已经在你的酒馆实例中完成安装和运行验收。

## 开发检查

在仓库根目录运行：

```text
node agent/doupo-agent-ui/run-tests.mjs
node %USERPROFILE%/.dsh/skills/sillytavern-extension-dev/scripts/validate-extension-manifest.mjs --root .
```

## 依赖与兼容性

- 运行环境：浏览器端 SillyTavern UI 扩展；
- 不需要服务器插件；
- 目标是当前 SillyTavern 发布版，但具体事件 payload 和扩展管理器行为仍以实际安装版本为准。

## 许可证

本项目采用 GNU Affero General Public License v3.0，见 [LICENSE](LICENSE)。
