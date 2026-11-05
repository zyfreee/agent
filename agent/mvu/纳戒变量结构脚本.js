// 斗破纳戒 · 变量结构脚本（MVU_Zod 套件核心件）
// 依据：写卡知识库《MVU_ZOD指南》《MVU自查》。
// 作用：把 stat_data.斗破纳戒 的 22 个字段注册成 zod v4 Schema，挂到酒馆助手
// registerVariableSchema({type:'message'}) 上。此后 MVU 每次变量初始化和每条更新
// 命令都会整体 safeParse：形态不对的写入在 MVU 层就被丢弃/修复，扩展仲裁器再在此
// 之上做有状态裁决（境界链推进、整表语义、更新时间指纹）。
//
// 规则要点（MVU_ZOD指南）：
// - z 与 _ 由酒馆助手全局提供，脚本内不要 import；
// - z.coerce.number() 优于 z.number()；.prefault 优于 .default；约束用 .transform（clamp 而非 min/max）；
// - 不用 .strict()/.passthrough()（zod v4 无此链）；
// - 必须幂等：Schema.parse(Schema.parse(x)) === Schema.parse(x)。

import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

// 晋升链（与扩展仲裁器 REALM_CHAIN 一致）：正向至多一小阶、回退不限——这是有状态规则，
// Schema 只校验"值必须是链上阶名或空"，推进合法性由扩展裁决。
const REALM_CHAIN = ['斗之气', '斗者', '斗师', '大斗师', '斗灵', '斗王', '斗皇', '斗宗', '斗尊', '斗圣', '斗帝'];

// 档案字段上限（与扩展 arbiter PROFILE_CAPS 一致）：attribute 12，appearance 160，其余 60。
const PROFILE_LIMITS = {
    姓名: 60, 性别: 60, 年龄: 60, 种族: 60, 出身: 60,
    所属: 60, 斗气属性: 12, 天赋: 60, 外貌: 160,
};
const GOLD_MAX = 999999999;

const capText = (limit) => (value) => String(value).slice(0, limit);

const Schema = z.object({
    斗破纳戒: z.object({
        // —— 档案 9：整值覆盖，超长截断修复 ——
        姓名: z.string().prefault('').transform(capText(PROFILE_LIMITS.姓名)),
        性别: z.string().prefault('').transform(capText(PROFILE_LIMITS.性别)),
        年龄: z.string().prefault('').transform(capText(PROFILE_LIMITS.年龄)),
        种族: z.string().prefault('').transform(capText(PROFILE_LIMITS.种族)),
        出身: z.string().prefault('').transform(capText(PROFILE_LIMITS.出身)),
        所属: z.string().prefault('').transform(capText(PROFILE_LIMITS.所属)),
        斗气属性: z.string().prefault('').transform(capText(PROFILE_LIMITS.斗气属性)),
        天赋: z.string().prefault('').transform(capText(PROFILE_LIMITS.天赋)),
        外貌: z.string().prefault('').transform(capText(PROFILE_LIMITS.外貌)),
        // —— 境界 2：必须是链上阶名；段位 一~九+段/星。语义推进由扩展仲裁 ——
        境界: z.enum([...REALM_CHAIN, '']).prefault(''),
        段位: z.string().regex(/^[一二三四五六七八九]\s*[段星]$/).or(z.literal('')).prefault(''),
        // —— 数值 1：绝对值整数，越界钳制 ——
        金币: z.coerce.number().catch(0).transform((value) => _.clamp(Math.round(value), 0, GOLD_MAX)),
        // —— 清单 9：帧里是整表字符串（结构化解析在扩展仲裁器），Schema 只保形态 ——
        功法: z.string().prefault(''),
        斗技: z.string().prefault(''),
        装备: z.string().prefault(''),
        天材地宝: z.string().prefault(''),
        行囊: z.string().prefault(''),
        称号: z.string().prefault(''),
        丹方: z.string().prefault(''),
        器谱: z.string().prefault(''),
        炼制: z.string().prefault(''),
        目标: z.string().prefault(''),
        // —— 系统 1：指纹字段，规则禁止模型更新；这里只保形态 ——
        更新时间: z.string().prefault(''),
    }),
});

$(() => {
    registerMvuSchema(Schema);
});
