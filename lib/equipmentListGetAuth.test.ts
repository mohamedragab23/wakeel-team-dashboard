import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/** Contract under test — mirrors GET role gate on equipment list routes. */
function isEquipmentListGetRoleAllowed(role?: string): boolean {
  return role === 'admin' || role === 'supervisor';
}

function scopeEquipmentListRows(
  role: string | undefined,
  actorCode: string | undefined,
  rows: Array<{ supervisorCode: string }>
): Array<{ supervisorCode: string }> {
  if (role === 'supervisor') {
    const code = String(actorCode ?? '').trim();
    return rows.filter((r) => r.supervisorCode === code);
  }
  return rows;
}

describe('S5 equipment deliveries/returns GET role gate', () => {
  it('allows admin and supervisor only', () => {
    assert.equal(isEquipmentListGetRoleAllowed('admin'), true);
    assert.equal(isEquipmentListGetRoleAllowed('supervisor'), true);
    assert.equal(isEquipmentListGetRoleAllowed('recruitment_manager'), false);
    assert.equal(isEquipmentListGetRoleAllowed(undefined), false);
    assert.equal(isEquipmentListGetRoleAllowed(''), false);
  });

  it('supervisor remains scoped to own supervisorCode', () => {
    const rows = [
      { supervisorCode: 'S1' },
      { supervisorCode: 'S2' },
      { supervisorCode: 'S1' },
    ];
    assert.deepEqual(scopeEquipmentListRows('supervisor', 'S1', rows), [
      { supervisorCode: 'S1' },
      { supervisorCode: 'S1' },
    ]);
    assert.deepEqual(scopeEquipmentListRows('admin', 'A1', rows), rows);
  });

  it('both GET handlers enforce admin|supervisor role gate', () => {
    const deliveries = readFileSync(
      join(process.cwd(), 'app/api/equipment-deliveries/route.ts'),
      'utf8'
    );
    const returns = readFileSync(join(process.cwd(), 'app/api/equipment-returns/route.ts'), 'utf8');
    const gate =
      "decoded.role !== 'admin' && decoded.role !== 'supervisor'";
    assert.ok(deliveries.includes(gate), 'deliveries GET missing role gate');
    assert.ok(returns.includes(gate), 'returns GET missing role gate');
    assert.ok(deliveries.includes('filterRowsBySupervisorInZoneScope'));
    assert.ok(returns.includes('filterRowsBySupervisorInZoneScope'));
  });
});
