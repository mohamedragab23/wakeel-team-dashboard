import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveEquipmentPaymentStatus,
  totalCreditedMilli,
} from '@/lib/equipmentLiability/paymentStatus';
import {
  EQUIPMENT_PAYMENT_ERROR,
  recordEquipmentLiabilityCashPayment,
  validateCashPaymentAmount,
  toDeskIssueView,
  SHEET_EQUIPMENT_LIABILITY_PAYMENTS,
  EQUIPMENT_LIABILITY_PAYMENT_HEADERS,
} from '@/lib/equipmentLiability/payments';
import { applySettlementPayment, withImmutableOriginal } from '@/lib/equipmentLiability/store';
import { EQUIPMENT_PAYMENT_LOCK_TTL_SECONDS } from '@/lib/equipmentLiability/paymentLock';
import { adminFeatureAllowed } from '@/lib/adminFeatureAccess';
import { SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';

function baseIssue(overrides: Record<string, unknown> = {}) {
  return {
    equipmentIssueId: 'iss_1',
    riderCode: 'R001',
    riderNameSnapshot: 'طيار تجريبي',
    zoneSnapshot: 'Z1',
    supervisorCodeSnapshot: 'S1',
    supervisorNameSnapshot: 'مشرف',
    issueDate: '2026-01-01',
    activationDate: '2026-01-01',
    bagType: 'motorcycle' as const,
    bagCostMilli: 53000,
    shirtQty: 2,
    shirtCostMilli: 27000,
    securityFeeMilli: 10000,
    securityPaidUpfront: true,
    originalLiabilityMilli: 80000,
    outstandingMilli: 80000,
    amountDeductedMilli: 0,
    settlementPaidMilli: 0,
    installmentsCompleted: 0,
    status: 'open' as const,
    deliveryRowRef: 'del_1',
    jacketHeld: false,
    helmetHeld: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'admin',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'admin',
    sheetRow: 2,
    ...overrides,
  };
}

describe('equipment liability desk — payment status', () => {
  it('A/Y: UNPAID when nothing credited and outstanding > 0', () => {
    assert.equal(
      deriveEquipmentPaymentStatus({
        settlementPaidMilli: 0,
        amountDeductedMilli: 0,
        outstandingMilli: 80000,
      }),
      'UNPAID'
    );
  });

  it('Y: PARTIALLY_PAID when credited > 0 and outstanding > 0', () => {
    assert.equal(
      deriveEquipmentPaymentStatus({
        settlementPaidMilli: 20000,
        amountDeductedMilli: 0,
        outstandingMilli: 60000,
      }),
      'PARTIALLY_PAID'
    );
    assert.equal(
      deriveEquipmentPaymentStatus({
        settlementPaidMilli: 0,
        amountDeductedMilli: 10000,
        outstandingMilli: 70000,
      }),
      'PARTIALLY_PAID'
    );
  });

  it('Y: PAID when outstanding === 0', () => {
    assert.equal(
      deriveEquipmentPaymentStatus({
        settlementPaidMilli: 50000,
        amountDeductedMilli: 30000,
        outstandingMilli: 0,
      }),
      'PAID'
    );
  });

  it('totalCredited = cash + auto', () => {
    assert.equal(
      totalCreditedMilli({ settlementPaidMilli: 10000, amountDeductedMilli: 5000 }),
      15000
    );
  });
});

describe('equipment liability desk — amount validation', () => {
  it('E: reject zero', () => {
    const r = validateCashPaymentAmount(0, 80000);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, EQUIPMENT_PAYMENT_ERROR.INVALID_AMOUNT);
  });

  it('F: reject negative', () => {
    const r = validateCashPaymentAmount(-100, 80000);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, EQUIPMENT_PAYMENT_ERROR.INVALID_AMOUNT);
  });

  it('D: reject overpayment (no clamp)', () => {
    const r = validateCashPaymentAmount(90000, 80000);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, EQUIPMENT_PAYMENT_ERROR.EXCEEDS_OUTSTANDING);
  });

  it('accept exact outstanding', () => {
    const r = validateCashPaymentAmount(80000, 80000);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.paid, 80000);
  });
});

describe('equipment liability desk — recordCashPayment orchestration', () => {
  it('B: partial cash payment updates settlement only', async () => {
    const issue = baseIssue();
    const payments: any[] = [];
    let current = { ...issue };

    const result = await recordEquipmentLiabilityCashPayment(
      {
        equipmentIssueId: issue.equipmentIssueId,
        amountMilli: 20000,
        paymentMethod: 'CASH',
        note: 'partial',
        idempotencyKey: 'idem_partial_1',
      },
      { code: 'ADM1', name: 'Admin One' },
      {
        getById: async () => current,
        findPaymentByIdempotencyKey: async (k) => payments.find((p) => p.idempotencyKey === k) || null,
        acquireLock: async () => ({ ok: true as const, token: 't', release: async () => undefined }),
        getCachedResult: async () => null,
        cacheResult: async () => undefined,
        appendPayment: async (p) => {
          payments.push(p);
        },
        applyPayment: async (_id, paid, actor) => {
          const next = withImmutableOriginal(current, {
            settlementPaidMilli: (current.settlementPaidMilli || 0) + paid,
            outstandingMilli: current.outstandingMilli - paid,
            amountDeductedMilli: current.amountDeductedMilli,
            installmentsCompleted: current.installmentsCompleted,
            status: current.outstandingMilli - paid <= 0 ? 'settled' : 'open',
            updatedBy: actor.code,
          });
          current = next;
          return { ok: true as const, issue: next };
        },
        skipAudit: true,
      }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.replayed, false);
    assert.equal(result.issue.settlementPaidMilli, 20000);
    assert.equal(result.issue.outstandingMilli, 60000);
    assert.equal(result.issue.amountDeductedMilli, 0); // P
    assert.equal(result.issue.originalLiabilityMilli, 80000); // O
    assert.equal(result.issue.installmentsCompleted, 0); // Q
    assert.equal(result.paymentStatus, 'PARTIALLY_PAID');
    assert.equal(payments.length, 1); // M
    assert.equal(payments[0].actorCode, 'ADM1');
    assert.equal(payments[0].resultingOutstandingMilli, 60000); // N
  });

  it('C: full cash payment settles outstanding', async () => {
    const issue = baseIssue({ outstandingMilli: 30000, settlementPaidMilli: 50000 });
    let current = { ...issue };
    const payments: any[] = [];

    const result = await recordEquipmentLiabilityCashPayment(
      {
        equipmentIssueId: issue.equipmentIssueId,
        amountMilli: 30000,
        paymentMethod: 'BANK_TRANSFER',
        idempotencyKey: 'idem_full_1',
      },
      { code: 'ADM1', name: 'Admin' },
      {
        getById: async () => current,
        findPaymentByIdempotencyKey: async (k) => payments.find((p) => p.idempotencyKey === k) || null,
        acquireLock: async () => ({ ok: true as const, token: 't', release: async () => undefined }),
        getCachedResult: async () => null,
        cacheResult: async () => undefined,
        appendPayment: async (p) => {
          payments.push(p);
        },
        applyPayment: async (_id, paid, actor) => {
          const next = withImmutableOriginal(current, {
            settlementPaidMilli: (current.settlementPaidMilli || 0) + paid,
            outstandingMilli: 0,
            status: 'settled',
            updatedBy: actor.code,
          });
          current = next;
          return { ok: true as const, issue: next };
        },
        skipAudit: true,
      }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.issue.outstandingMilli, 0);
    assert.equal(result.paymentStatus, 'PAID');
    assert.equal(result.issue.status, 'settled');
  });

  it('D/E/F: invalid amounts rejected with no mutation', async () => {
    const issue = baseIssue();
    let applyCalls = 0;
    for (const amount of [0, -50, 90000]) {
      const r = await recordEquipmentLiabilityCashPayment(
        {
          equipmentIssueId: issue.equipmentIssueId,
          amountMilli: amount,
          paymentMethod: 'CASH',
          idempotencyKey: `bad_${amount}`,
        },
        { code: 'A', name: 'A' },
        {
          getById: async () => issue,
          findPaymentByIdempotencyKey: async () => null,
          acquireLock: async () => ({ ok: true as const, token: 't', release: async () => undefined }),
          getCachedResult: async () => null,
          cacheResult: async () => undefined,
          appendPayment: async () => {
            throw new Error('should not append');
          },
          applyPayment: async () => {
            applyCalls++;
            return { ok: true as const, issue };
          },
          skipAudit: true,
        }
      );
      assert.equal(r.ok, false);
    }
    assert.equal(applyCalls, 0);
  });

  it('G: duplicate idempotency returns original and does not apply twice', async () => {
    const issue = baseIssue();
    let current = { ...issue };
    const payments: any[] = [];
    let applyCount = 0;

    const deps = {
      getById: async () => current,
      findPaymentByIdempotencyKey: async (k: string) =>
        payments.find((p) => p.idempotencyKey === k) || null,
      acquireLock: async () => ({ ok: true as const, token: 't', release: async () => undefined }),
      getCachedResult: async () => null,
      cacheResult: async () => undefined,
      appendPayment: async (p: any) => {
        payments.push(p);
      },
      applyPayment: async (_id: string, paid: number, actor: { code: string; name: string }) => {
        applyCount++;
        const next = withImmutableOriginal(current, {
          settlementPaidMilli: (current.settlementPaidMilli || 0) + paid,
          outstandingMilli: current.outstandingMilli - paid,
          updatedBy: actor.code,
        });
        current = next;
        return { ok: true as const, issue: next };
      },
      skipAudit: true,
    };

    const first = await recordEquipmentLiabilityCashPayment(
      {
        equipmentIssueId: issue.equipmentIssueId,
        amountMilli: 10000,
        paymentMethod: 'CASH',
        idempotencyKey: 'same_key',
      },
      { code: 'A', name: 'A' },
      deps
    );
    const second = await recordEquipmentLiabilityCashPayment(
      {
        equipmentIssueId: issue.equipmentIssueId,
        amountMilli: 10000,
        paymentMethod: 'CASH',
        idempotencyKey: 'same_key',
      },
      { code: 'A', name: 'A' },
      deps
    );

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(second.replayed, true);
      assert.equal(first.payment.paymentId, second.payment.paymentId);
    }
    assert.equal(applyCount, 1);
    assert.equal(current.settlementPaidMilli, 10000);
    assert.equal(payments.length, 1);
  });

  it('H: concurrent payment — lock busy for loser', async () => {
    const issue = baseIssue();
    const r = await recordEquipmentLiabilityCashPayment(
      {
        equipmentIssueId: issue.equipmentIssueId,
        amountMilli: 10000,
        paymentMethod: 'CASH',
        idempotencyKey: 'lock_test',
      },
      { code: 'A', name: 'A' },
      {
        getById: async () => issue,
        findPaymentByIdempotencyKey: async () => null,
        acquireLock: async () => ({ ok: false as const, reason: 'lock_busy' as const }),
        getCachedResult: async () => null,
        cacheResult: async () => undefined,
        appendPayment: async () => undefined,
        applyPayment: async () => ({ ok: true as const, issue }),
        skipAudit: true,
      }
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, EQUIPMENT_PAYMENT_ERROR.LOCK_BUSY);
  });

  it('I: liability not found', async () => {
    const r = await recordEquipmentLiabilityCashPayment(
      {
        equipmentIssueId: 'missing',
        amountMilli: 1000,
        paymentMethod: 'CASH',
        idempotencyKey: 'nf',
      },
      { code: 'A', name: 'A' },
      {
        getById: async () => null,
        findPaymentByIdempotencyKey: async () => null,
        acquireLock: async () => ({ ok: true as const, token: 't', release: async () => undefined }),
        getCachedResult: async () => null,
        cacheResult: async () => undefined,
        skipAudit: true,
      }
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, EQUIPMENT_PAYMENT_ERROR.NOT_FOUND);
      assert.equal(r.httpStatus, 404);
    }
  });

  it('L: already settled liability not payable', async () => {
    const issue = baseIssue({ status: 'settled', outstandingMilli: 0, settlementPaidMilli: 80000 });
    const r = await recordEquipmentLiabilityCashPayment(
      {
        equipmentIssueId: issue.equipmentIssueId,
        amountMilli: 1000,
        paymentMethod: 'CASH',
        idempotencyKey: 'settled_x',
      },
      { code: 'A', name: 'A' },
      {
        getById: async () => issue,
        findPaymentByIdempotencyKey: async () => null,
        acquireLock: async () => ({ ok: true as const, token: 't', release: async () => undefined }),
        getCachedResult: async () => null,
        cacheResult: async () => undefined,
        skipAudit: true,
      }
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, EQUIPMENT_PAYMENT_ERROR.NOT_PAYABLE);
  });

  it('Z: multiple payments accumulate correctly', async () => {
    let current = baseIssue();
    const payments: any[] = [];
    const deps = {
      getById: async () => current,
      findPaymentByIdempotencyKey: async (k: string) =>
        payments.find((p) => p.idempotencyKey === k) || null,
      acquireLock: async () => ({ ok: true as const, token: 't', release: async () => undefined }),
      getCachedResult: async () => null,
      cacheResult: async () => undefined,
      appendPayment: async (p: any) => {
        payments.push(p);
      },
      applyPayment: async (_id: string, paid: number, actor: { code: string }) => {
        current = withImmutableOriginal(current, {
          settlementPaidMilli: (current.settlementPaidMilli || 0) + paid,
          outstandingMilli: current.outstandingMilli - paid,
          status: current.outstandingMilli - paid <= 0 ? 'settled' : 'open',
          updatedBy: actor.code,
        });
        return { ok: true as const, issue: current };
      },
      skipAudit: true,
    };

    for (const [i, amt] of [
      [1, 10000],
      [2, 20000],
      [3, 50000],
    ] as const) {
      const r = await recordEquipmentLiabilityCashPayment(
        {
          equipmentIssueId: current.equipmentIssueId,
          amountMilli: amt,
          paymentMethod: 'CASH',
          idempotencyKey: `multi_${i}`,
        },
        { code: 'A', name: 'A' },
        deps
      );
      assert.equal(r.ok, true);
    }
    assert.equal(current.settlementPaidMilli, 80000);
    assert.equal(current.outstandingMilli, 0);
    assert.equal(payments.length, 3);
  });
});

describe('equipment liability desk — applySettlementPayment hardening', () => {
  it('rejects overpayment without clamping (surface code)', async () => {
    // Pure validation path used before apply; apply itself also rejects.
    const v = validateCashPaymentAmount(100, 50);
    assert.equal(v.ok, false);
  });
});

describe('equipment liability desk — permissions & flags & isolation', () => {
  it('J: unauthorized limited admin without equipment_liability', () => {
    assert.equal(adminFeatureAllowed('limited:dashboard', 'equipment_liability'), false);
    assert.equal(adminFeatureAllowed('limited:equipment_liability', 'equipment_liability'), true);
  });

  it('K: payments route requires ledger flag', () => {
    const body = readFileSync(
      join(process.cwd(), 'app/api/admin/equipment-liability/[id]/payments/route.ts'),
      'utf8'
    );
    assert.ok(body.includes('isEquipmentLedgerEnabled'));
    assert.ok(body.includes("assertAdminApiAccess(decoded, 'equipment_liability')"));
  });

  it('U: Returns V2 remains untouched by desk payment sheet', () => {
    assert.equal(SHEET_EQUIPMENT_LIABILITY_PAYMENTS, 'مدفوعات_عهدة_المعدات');
    assert.notEqual(SHEET_EQUIPMENT_LIABILITY_PAYMENTS, 'تسوية_استرجاع_المعدات');
    const paymentsSrc = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/payments.ts'),
      'utf8'
    );
    assert.ok(!paymentsSrc.includes('تسوية_استرجاع_المعدات'));
    assert.ok(!paymentsSrc.includes('equipmentReturns'));
  });

  it('V: Auto Deduction remains untouched (desk does not enable/import engine)', () => {
    const paymentsSrc = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/payments.ts'),
      'utf8'
    );
    assert.ok(!paymentsSrc.includes('equipmentDeductions'));
    assert.ok(!paymentsSrc.includes('FEATURE_AUTO_EQUIPMENT_DEDUCTIONS'));
    const page = readFileSync(join(process.cwd(), 'app/admin/equipment-liability/page.tsx'), 'utf8');
    assert.ok(!page.includes('FEATURE_AUTO_EQUIPMENT_DEDUCTIONS'));
  });

  it('R/S/T: desk payment lib does not touch payroll / rooster / salary', () => {
    const paymentsSrc = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/payments.ts'),
      'utf8'
    );
    assert.ok(!/payroll|rooster|salary/i.test(paymentsSrc));
  });

  it('lock TTL is short (not 90 days)', () => {
    assert.ok(EQUIPMENT_PAYMENT_LOCK_TTL_SECONDS <= 120);
    assert.ok(EQUIPMENT_PAYMENT_LOCK_TTL_SECONDS > 0);
  });

  it('canonical liability sheet remains عهدة_المعدات', () => {
    assert.equal(SHEET_EQUIPMENT_LIABILITY, 'عهدة_المعدات');
    assert.ok(EQUIPMENT_LIABILITY_PAYMENT_HEADERS.includes('idempotencyKey'));
    assert.ok(EQUIPMENT_LIABILITY_PAYMENT_HEADERS.includes('paymentId'));
  });

  it('W: list route fails closed on Sheets error (no empty success)', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/admin/equipment-liability/route.ts'),
      'utf8'
    );
    assert.ok(route.includes('status: 500'));
    assert.ok(route.includes('لم يتم إرجاع بيانات فارغة') || route.includes('فشل قراءة'));
  });

  it('X: desk consumes liability created by ledger (no recruitment create)', () => {
    const paymentsSrc = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/payments.ts'),
      'utf8'
    );
    assert.ok(!paymentsSrc.includes('createLiabilityFromDelivery'));
    const page = readFileSync(join(process.cwd(), 'app/admin/equipment-liability/page.tsx'), 'utf8');
    assert.ok(page.includes('/api/admin/equipment-liability'));
  });

  it('toDeskIssueView separates payment status from liability status', () => {
    const view = toDeskIssueView(
      baseIssue({
        status: 'open',
        settlementPaidMilli: 10000,
        amountDeductedMilli: 0,
        outstandingMilli: 70000,
      })
    );
    assert.equal(view.status, 'open');
    assert.equal(view.paymentStatus, 'PARTIALLY_PAID');
    assert.equal(view.cashPaidMilli, 10000);
    assert.equal(view.autoDeductedMilli, 0);
  });

  it('SRS amendment documents desk under Ledger, independent of Returns', () => {
    const freeze = readFileSync(join(process.cwd(), 'docs/SRS014_DESIGN_FREEZE.md'), 'utf8');
    assert.ok(freeze.includes('Equipment Liability Management Desk'));
    assert.ok(freeze.includes('مدفوعات_عهدة_المعدات'));
    assert.ok(freeze.includes('independently'));
  });

  it('menu exposes desk under equipment_liability permission', () => {
    const access = readFileSync(join(process.cwd(), 'lib/adminFeatureAccess.ts'), 'utf8');
    assert.ok(access.includes("/admin/equipment-liability"));
    assert.ok(access.includes("feature: 'equipment_liability'"));
  });

  it('applySettlementPayment export still exists for Returns path compatibility', () => {
    assert.equal(typeof applySettlementPayment, 'function');
  });
});
