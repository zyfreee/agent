import assert from 'node:assert/strict';
import { createNpcRelations } from './npc-relations.js';

// 收边：合法边 upsert、自指/缺名拒绝、立场从自由文本折出来。
{
    const graph = createNpcRelations({ now: () => 't0' });
    const result = graph.upsert([
        { from: '萧炎', to: '药老', relation: '师徒', attitude: '敬重', day: 2, floor: 3 },
        { from: '萧炎', to: '萧炎' },
        { from: '', to: '药老' },
        { from: '纳兰嫣然', to: '萧炎', relation: '退婚之仇', attitude: '敌视', day: 1 },
    ]);
    assert.equal(result.status, 'applied');
    assert.equal(result.applied.length, 2, '自指和缺名的边要逐条拒绝');
    assert.equal(result.rejected.length, 2);
    const mentor = graph.forPerson('萧炎').find(item => item.to === '药老');
    assert.equal(mentor.stance, '师徒', '师徒要从「关系」自由文本折出来');
    assert.equal(mentor.day, 2);
    assert.equal(mentor.floor, 3);
    const hostile = graph.forPerson('萧炎').find(item => item.from === '纳兰嫣然');
    assert.equal(hostile.stance, '敌对', '「退婚之仇/敌视」要折成敌对');
    assert.equal(graph.status().total, 2);
}

// 有向边：A→B 与 B→A 独立；between 双向都查；同边 upsert 版本前进不新增。
{
    const graph = createNpcRelations({ now: () => 't0' });
    graph.upsert([
        { from: '甲', to: '乙', stance: '同盟' },
        { from: '乙', to: '甲', stance: '警惕' },
    ]);
    assert.equal(graph.status().total, 2);
    const both = graph.between('甲', '乙');
    assert.equal(both.length, 2);
    assert.ok(both.some(item => item.direction === 'outbound' && item.stance === '同盟'));
    assert.ok(both.some(item => item.direction === 'inbound' && item.stance === '警惕'));
    graph.upsert([{ from: '甲', to: '乙', stance: '友好' }]);
    assert.equal(graph.status().total, 2, '同一条边 upsert 只更新不新增');
    assert.equal(graph.between('甲', '乙').find(item => item.direction === 'outbound').stance, '友好');
}

// 二跳：种子的盟友的敌人要能带出来，并标注走的是谁的关系。
{
    const graph = createNpcRelations({ now: () => 't0' });
    graph.upsert([
        { from: '萧战', to: '萧炎', stance: '血亲' },
        { from: '萧炎', to: '纳兰嫣然', stance: '敌对' },
    ]);
    const lines = graph.hopLines(['萧战']);
    assert.ok(lines.some(line => line.includes('萧战—血亲—萧炎')), '一跳要出现');
    assert.ok(lines.some(line => line.includes('纳兰嫣然') && line.includes('【萧炎的关系】')), '二跳要标注中间人');
    assert.ok(graph.hopLines([]).length === 0, '空种子不产出行');
}

// 对称体检：单边强绑定、两边立场打架都要报；对称的正常边不报。
{
    const graph = createNpcRelations({ now: () => 't0' });
    graph.upsert([{ from: '甲', to: '乙', stance: '同盟' }]);
    let problems = graph.asymmetries();
    assert.equal(problems.length, 1);
    assert.equal(problems[0].type, 'one_sided_bond');
    graph.upsert([{ from: '乙', to: '甲', stance: '敌对' }]);
    problems = graph.asymmetries();
    assert.equal(problems.length, 1);
    assert.equal(problems[0].type, 'stance_conflict');
    graph.upsert([{ from: '乙', to: '甲', stance: '同盟' }]);
    assert.equal(graph.asymmetries().length, 0, '对称的同盟不是问题');
    // 单边「中立」也不报：中立没有绑定含义。
    const loose = createNpcRelations({ now: () => 't0' });
    loose.upsert([{ from: '丙', to: '丁', stance: '中立' }]);
    assert.equal(loose.asymmetries().length, 0);
}

// 删除人物连带清边；快照/恢复 round-trip；上限保护；清空。
{
    const graph = createNpcRelations({ maxEdges: 3, now: () => 't0' });
    graph.upsert([
        { from: 'A', to: 'B', stance: '友好' },
        { from: 'B', to: 'C', stance: '敌对' },
        { from: 'C', to: 'A', stance: '中立' },
    ]);
    const snapshot = graph.snapshot();
    const reloaded = createNpcRelations({ maxEdges: 10, now: () => 't1' });
    reloaded.restore(JSON.parse(JSON.stringify(snapshot)));
    assert.equal(reloaded.status().total, 3, '恢复后边数一致');
    assert.equal(reloaded.remove('B').removed, 2, '删除人物要连出边带入边一起清');
    assert.equal(reloaded.status().total, 1);
    const full = createNpcRelations({ maxEdges: 1, now: () => 't0' });
    full.upsert([{ from: 'A', to: 'B', stance: '友好' }]);
    const overflow = full.upsert([{ from: 'C', to: 'D', stance: '敌对' }]);
    assert.equal(overflow.applied.length, 0);
    assert.equal(overflow.rejected[0].reason, 'relations_full');
    assert.equal(full.clear().status, 'cleared');
    assert.equal(full.status().total, 0);
}

console.log('npc-relations 测试通过');
