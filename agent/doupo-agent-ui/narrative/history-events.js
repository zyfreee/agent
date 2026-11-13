/** 楼层指纹：不存正文，只存"这一楼动没动"的形状特征（角色/swipe/发送时刻/正文长度），留在内存里当删楼差分的底片。 */
export function chatFloorShape(message) {
    if (!message || typeof message !== 'object') return 'x';
    return `${message.is_user === true ? 'u' : 'a'}|${message.swipe_id ?? ''}|${message.send_date ?? ''}|${typeof message.mes === 'string' ? message.mes.length : 0}`;
}

/**
 * 定位被删的楼层：酒馆 MESSAGE_DELETED 的载荷是删后的聊天长度，不是被删的楼层号（1.19.0 实测）。
 * 拿删前指纹与删后指纹逐位对比——第一个对不上的位置就是被删的那楼。
 * 返回 null 表示定不了（快照缺失、长度对不上），调用方自行退回旧口径，绝不硬猜。
 */
export function findDeletedFloor(beforeShapes, afterShapes) {
    if (!Array.isArray(beforeShapes) || !Array.isArray(afterShapes)) return null;
    if (beforeShapes.length !== afterShapes.length + 1) return null;
    let cursor = 0;
    while (cursor < afterShapes.length && beforeShapes[cursor] === afterShapes[cursor]) cursor += 1;
    return cursor;
}
