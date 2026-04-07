import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { Bytes, type uint64 } from '@algorandfoundation/algorand-typescript'
import { afterEach, describe, expect, test } from 'vitest'
import { BoundedFeeSig, UnboundedFeeSig } from './fee-bounding.algo'

describe('LogicSig Fee Bounding', () => {
  const ctx = new TestExecutionContext()
  afterEach(() => ctx.reset())

  const LEASE = Bytes('aaaabbbbccccddddeeeeffffgggghhhh', { length: 32 })

  /** Helper: set up a LogicSig with the INTENDED_RECEIVER template var */
  function setup() {
    const receiver = ctx.any.account()
    ctx.setTemplateVar('INTENDED_RECEIVER', receiver)
    ctx.setTemplateVar('LEASE', LEASE)
    return receiver
  }

  /** Helper: run a LogicSig against a payment transaction */
  function evalPayment(lsig: UnboundedFeeSig | BoundedFeeSig, overrides: Record<string, unknown> = {}) {
    let result: boolean | uint64
    ctx.txn.createScope([ctx.any.txn.payment({ amount: 500_000, fee: 1_000, lease: LEASE, ...overrides })]).execute(() => {
      result = ctx.executeLogicSig(lsig)
    })
    return result!
  }

  describe('UnboundedFeeSig — missing fee check', () => {
    test('approves valid payment with normal fee', () => {
      const receiver = setup()
      expect(evalPayment(new UnboundedFeeSig(), { receiver })).toBe(true)
    })

    test('VULN: approves excessive fee (fee draining)', () => {
      const receiver = setup()
      expect(evalPayment(new UnboundedFeeSig(), { receiver, fee: 100_000 })).toBe(true)
    })
  })

  describe('BoundedFeeSig — fee check enforced', () => {
    test('approves valid payment with normal fee', () => {
      const receiver = setup()
      expect(evalPayment(new BoundedFeeSig(), { receiver })).toBe(true)
    })

    test('rejects excessive fee', () => {
      const receiver = setup()
      expect(evalPayment(new BoundedFeeSig(), { receiver, fee: 10_000 })).toBe(false)
    })
  })
})
