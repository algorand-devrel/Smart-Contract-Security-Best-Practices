import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { Bytes, Uint64, type uint64 } from '@algorandfoundation/algorand-typescript'
import { afterEach, describe, expect, test } from 'vitest'
import { SafePaymentSig, UnsafePaymentSig } from './delegated-logic-sig.algo'

describe('Delegated Logic Signatures', () => {
  const ctx = new TestExecutionContext()
  afterEach(() => ctx.reset())

  const LEASE = Bytes('aaaabbbbccccddddeeeeffffgggghhhh', { length: 32 })
  const MAX_AMOUNT = Uint64(1_000_000)

  /** Helper: run a LogicSig against a payment transaction */
  function evalPayment(lsig: UnsafePaymentSig | SafePaymentSig, overrides: Record<string, unknown> = {}, ...args: unknown[]) {
    let result: boolean | uint64

    const paymentTxn = ctx.any.txn.payment({ amount: 500_000, fee: 1_000, ...overrides })

    ctx.txn.createScope([paymentTxn]).execute(() => {
      result = ctx.executeLogicSig(lsig, ...args)
    })

    return result!
  }

  describe('UnsafePaymentSig — demonstrates missing checks', () => {
    const lsig = () => new UnsafePaymentSig()

    test('approves valid payment', () => {
      expect(evalPayment(lsig(), {}, MAX_AMOUNT)).toBe(true)
    })

    test('rejects amount over limit', () => {
      expect(evalPayment(lsig(), { amount: 2_000_000 }, MAX_AMOUNT)).toBe(false)
    })

    test('VULN: caller can raise maxAmount and bypass the intended cap', () => {
      expect(evalPayment(lsig(), { amount: 2_000_000 }, Uint64(10_000_000))).toBe(true)
    })

    // --- Every test below demonstrates a vulnerability ---

    test('VULN: approves RekeyTo (permanent account takeover)', () => {
      expect(evalPayment(lsig(), { rekeyTo: ctx.any.account() }, MAX_AMOUNT)).toBe(true)
    })

    test('VULN: approves CloseRemainderTo (drain all ALGO)', () => {
      expect(evalPayment(lsig(), { closeRemainderTo: ctx.any.account() }, MAX_AMOUNT)).toBe(true)
    })

    test('VULN: approves any receiver (no recipient restriction)', () => {
      expect(evalPayment(lsig(), { receiver: ctx.any.account() }, MAX_AMOUNT)).toBe(true)
    })

    test('VULN: approves without lease (no replay protection)', () => {
      expect(evalPayment(lsig(), {}, MAX_AMOUNT)).toBe(true) // no lease set, still approved
    })
  })

  describe('SafePaymentSig — all checks enforced', () => {
    let receiver: ReturnType<typeof ctx.any.account>

    function setupSafe() {
      receiver = ctx.any.account()
      ctx.setTemplateVar('INTENDED_RECEIVER', receiver)
      ctx.setTemplateVar('LEASE', LEASE)
      ctx.setTemplateVar('FIRST_VALID', Uint64(1_000))
      ctx.setTemplateVar('LAST_VALID', Uint64(2_000))
      return new SafePaymentSig()
    }

    /** Valid payment that satisfies all checks */
    function validPayment(overrides: Record<string, unknown> = {}) {
      return { receiver, lease: LEASE, firstValid: Uint64(1_000), lastValid: Uint64(2_000), ...overrides }
    }

    test('approves valid payment', () => {
      const lsig = setupSafe()
      expect(evalPayment(lsig, validPayment())).toBe(true)
    })

    test('rejects RekeyTo', () => {
      const lsig = setupSafe()
      expect(evalPayment(lsig, validPayment({ rekeyTo: ctx.any.account() }))).toBe(false)
    })

    test('rejects CloseRemainderTo', () => {
      const lsig = setupSafe()
      expect(evalPayment(lsig, validPayment({ closeRemainderTo: ctx.any.account() }))).toBe(false)
    })

    test('rejects wrong receiver', () => {
      const lsig = setupSafe()
      expect(evalPayment(lsig, validPayment({ receiver: ctx.any.account() }))).toBe(false)
    })

    test('rejects excessive amount', () => {
      const lsig = setupSafe()
      expect(evalPayment(lsig, validPayment({ amount: 2_000_000 }))).toBe(false)
    })

    test('rejects excessive fee', () => {
      const lsig = setupSafe()
      expect(evalPayment(lsig, validPayment({ fee: 10_000 }))).toBe(false)
    })

    test('rejects wrong lease (replay protection)', () => {
      const lsig = setupSafe()

      expect(
        evalPayment(lsig, validPayment({ lease: Bytes('zzzzyyyyxxxxwwwwvvvvuuuuttttssss', { length: 32 }) })),
      ).toBe(false)
    })

    test('rejects wrong firstValid (replay protection)', () => {
      const lsig = setupSafe()
      expect(evalPayment(lsig, validPayment({ firstValid: Uint64(999) }))).toBe(false)
    })

    test('rejects wrong lastValid (replay protection)', () => {
      const lsig = setupSafe()
      expect(evalPayment(lsig, validPayment({ lastValid: Uint64(3_000) }))).toBe(false)
    })

    test('rejects non-payment transaction', () => {
      const lsig = setupSafe()
      let result: boolean | uint64
      ctx.txn.createScope([ctx.any.txn.assetTransfer()]).execute(() => {
        result = ctx.executeLogicSig(lsig)
      })
      expect(result!).toBe(false)
    })
  })
})
