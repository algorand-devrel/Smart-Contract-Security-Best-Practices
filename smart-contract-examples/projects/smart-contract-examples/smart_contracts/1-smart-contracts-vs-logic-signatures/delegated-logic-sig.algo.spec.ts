import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { Bytes, type uint64 } from '@algorandfoundation/algorand-typescript'
import { afterEach, describe, expect, test } from 'vitest'
import { SafePaymentSig, UnsafePaymentSig } from './delegated-logic-sig.algo'

describe('Delegated Logic Signatures', () => {
  const ctx = new TestExecutionContext()
  afterEach(() => ctx.reset())

  const LEASE = Bytes('aaaabbbbccccddddeeeeffffgggghhhh', { length: 32 })

  /** Helper: run a LogicSig against a payment transaction */
  function evalPayment(lsig: UnsafePaymentSig | SafePaymentSig, overrides: Record<string, unknown> = {}) {
    let result: boolean | uint64

    const paymentTxn = ctx.any.txn.payment({ amount: 500_000, fee: 1_000, ...overrides })

    ctx.txn.createScope([paymentTxn]).execute(() => {
      result = ctx.executeLogicSig(lsig)
    })

    return result!
  }

  describe('UnsafePaymentSig — demonstrates missing checks', () => {
    const lsig = () => new UnsafePaymentSig()

    test('approves valid payment', () => {
      expect(evalPayment(lsig())).toBe(true)
    })

    test('rejects amount over limit', () => {
      expect(evalPayment(lsig(), { amount: 2_000_000 })).toBe(false)
    })

    // --- Every test below demonstrates a vulnerability ---

    test('VULN: approves RekeyTo (permanent account takeover)', () => {
      expect(evalPayment(lsig(), { rekeyTo: ctx.any.account() })).toBe(true)
    })

    test('VULN: approves CloseRemainderTo (drain all ALGO)', () => {
      expect(evalPayment(lsig(), { closeRemainderTo: ctx.any.account() })).toBe(true)
    })

    test('VULN: approves any receiver (no recipient restriction)', () => {
      expect(evalPayment(lsig(), { receiver: ctx.any.account() })).toBe(true)
    })

    test('VULN: approves without lease (no replay protection)', () => {
      expect(evalPayment(lsig())).toBe(true) // no lease set, still approved
    })
  })

  describe('SafePaymentSig — all checks enforced', () => {
    let receiver: ReturnType<typeof ctx.any.account>

    function setupSafe() {
      receiver = ctx.any.account()
      ctx.setTemplateVar('INTENDED_RECEIVER', receiver)
      ctx.setTemplateVar('LEASE', LEASE)
      return new SafePaymentSig()
    }

    /** Valid payment that satisfies all checks */
    function validPayment(overrides: Record<string, unknown> = {}) {
      return { receiver, lease: LEASE, ...overrides }
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
