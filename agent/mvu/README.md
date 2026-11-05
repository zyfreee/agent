# agent/mvu — 斗破纳戒 MVU_Zod 套件

按写卡知识库《MVU_ZOD指南》《MVU自查》标准构建的纳戒变量套件（2026-11-03）。

## 文件

| 文件 | 是什么 | 装到哪 |
|---|---|---|
| `纳戒变量结构脚本.js` | 变量结构脚本（Zod v4 Schema，22 字段形态约束） | 酒馆助手角色脚本（已通过卡面手术写入 `斗破卡面测试.png` 的 `data.extensions.tavern_helper.scripts`，id `dpc-mvu-schema`） |
| `纳戒MVU套件.json` | 世界书五件套导入件 | 线上世界书「斗破世界书」（uid 1171-1175） |

五件套：`[initvar]纳戒初始变量勿开`（禁用，YAML 初始值，深度4）、`变量列表`（常开 D0，`{{format_message_variable::stat_data}}`）、`[mvu_update]变量更新规则`（常开 D0，type/range/check）、`[mvu_update]变量输出格式`（常开 D0，JSON Patch RFC6902 英文固定格式）、`[mvu_update]变量输出格式强调`（禁用备用，模型漏输出块时启用）。

## 配套

- 扩展仲裁器 `doupo-agent-ui/host/mvu-arbiter.js`：JSON Patch 与旧 `_.set` 双格式解析（块解析仅审计，执行方是 MVU 框架）；帧差分裁决不变。
- 有状态规则（境界链推进、整表语义、更新时间指纹）仍在扩展仲裁器；Schema 只做无状态形态校验/修复。

## 废弃

- 根目录 `斗破纳戒MVU初始化.json`（旧版 InitVar 单条目）已被本套件取代，仅存档。
- 旧版蓝灯条目「[InitVar]纳戒初始变量」「[纳戒变量]变量列表与申报规则」已从线上世界书与卡内嵌角色书中移除（`_.set(旧,新)` 教学格式下线）。
