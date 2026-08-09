import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectInventoryAnomalies } from '@/lib/equipmentInventory/anomalies';

describe('inventory anomalies', () => {
  it('flags negative and zero stock', () => {
    const anomalies = detectInventoryAnomalies({
      motorcyclePouch: -1,
      bicyclePouch: 0,
      tshirt: 5,
      jacket: 2,
      helmet: 1,
    });
    assert.ok(anomalies.some((a) => a.code === 'negative_stock'));
    assert.ok(anomalies.some((a) => a.code === 'zero_stock'));
    assert.ok(!anomalies.some((a) => a.field === 'tshirt'));
  });
});
