# 酒馆扩展安装

本仓库根目录就是 SillyTavern 扩展入口，根目录包含 `manifest.json`。

在酒馆的扩展管理器中使用 GitHub 仓库地址：

```text
https://github.com/zyfreee/agent.git
```

安装器会把仓库克隆到 `public/scripts/extensions/third-party/agent`，并从该目录读取：

```text
public/scripts/extensions/third-party/agent/manifest.json
```

当前清单引用：

- `agent/doupo-agent-ui/index.js`
- `agent/doupo-agent-ui/host/style.css`

原来的模块目录仍然保留在 `agent/doupo-agent-ui/`，根目录清单只是为酒馆安装器提供正确入口。

## 更新步骤

如果之前已经安装过同名目录：

1. 在酒馆扩展管理器中更新扩展；或
2. 删除旧的 `public/scripts/extensions/third-party/agent` 后重新从 GitHub 安装；
3. 重启酒馆或刷新页面。

如果仍然报错，请把新的完整日志发来。
