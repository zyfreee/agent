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
- `settings.html`（扩展设置栏目模板，供 `renderExtensionTemplateAsync('third-party/agent', 'settings')` 读取）
- `agent/doupo-agent-ui/settings.html`（入口脚本的相对路径备用模板）

根目录模板是酒馆标准加载路径；入口目录副本只用于安装目录名变化或本地开发时的备用加载。两份模板由静态测试保持一致。

## 更新步骤

如果之前已经安装过同名目录：

1. 在酒馆扩展管理器中更新扩展；或
2. 删除旧的 `public/scripts/extensions/third-party/agent` 后重新从 GitHub 安装；
3. 重启酒馆或刷新页面。

如果仍然报错，请把新的完整日志发来。
