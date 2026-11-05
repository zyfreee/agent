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

当前 `manifest.json` 直接引用：

- `index.js`（根转发入口，重新导出 `agent/doupo-agent-ui/index.js` 的模块实现与生命周期钩子）
- `style.css`（根样式，与 `agent/doupo-agent-ui/host/style.css` 模块样式副本保持一致）

设置模板不在清单的 js/css 字段中，由入口在运行时读取：

- `settings.html`（根目录标准模板，供 `renderExtensionTemplateAsync('third-party/agent', 'settings')` 读取）
- `agent/doupo-agent-ui/settings.html`（模块入口的相对路径备用模板）

根转发入口、模块实现和备用文件均保留，不要把清单改指嵌套路径来“修正文档”。仓库根目录可运行 `node agent/doupo-agent-ui/extension-package.test.mjs` 检查清单目标、生命周期导出与双 CSS 一致性；运行 `node agent/doupo-agent-ui/settings-template.test.mjs` 检查标准/备用模板一致性及加载路径。离线检查不等于已在真实酒馆安装或更新成功。

## 更新步骤

如果之前已经安装过同名目录：

1. 在酒馆扩展管理器中更新扩展；或
2. 删除旧的 `public/scripts/extensions/third-party/agent` 后重新从 GitHub 安装；
3. 重启酒馆或刷新页面。

如果仍然报错，请把新的完整日志发来。
