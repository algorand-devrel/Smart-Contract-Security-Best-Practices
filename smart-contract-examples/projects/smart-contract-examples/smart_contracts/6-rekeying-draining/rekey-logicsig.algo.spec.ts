import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { type uint64 } from '@algorandfoundation/algorand-typescript'
import { afterEach, describe, expect, test } from 'vitest'
import { VulnerableRekey, SafeLogicSig } from './rekey-logicsig.algo'

describe('Rekeying & Draining — LogicSig Examples', () => {
  const ctx = new TestExecutionContext()
  afterEach(() => ctx.reset())

  /** Helper: run a LogicSig against a payment transaction */
  function evalPayment(lsig: VulnerableRekey | SafeLogicSig, overrides: Record<string, unknown> = {}) {
    let result: boolean | uint64

    const paymentTxn = ctx.any.txn.payment({ amount: 500_000, fee: 1_000, ...overrides })

    ctx.txn.createScope([paymentTxn]).execute(() => {
      result = ctx.executeLogicSig(lsig)
    })

    return result!
  }

  describe('VulnerableRekey — missing RekeyTo check', () => {
    const lsig = () => new VulnerableRekey()

    test('approves valid payment', () => {
      expect(evalPayment(lsig())).toBe(true)
    })

    test('VULN: approves transaction with rekeyTo set (account takeover)', () => {
      expect(evalPayment(lsig(), { rekeyTo: ctx.any.account() })).toBe(true)
    })
  })

  describe('SafeLogicSig — blocks rekeying and draining', () => {
    test('approves valid payment', () => {
      expect(evalPayment(new SafeLogicSig())).toBe(true)
    })

    test('rejects rekeyTo', () => {
      expect(evalPayment(new SafeLogicSig(), { rekeyTo: ctx.any.account() })).toBe(false)
    })

    test('rejects closeRemainderTo', () => {
      expect(evalPayment(new SafeLogicSig(), { closeRemainderTo: ctx.any.account() })).toBe(false)
    })
  })
})
