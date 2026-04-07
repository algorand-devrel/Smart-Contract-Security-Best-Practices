import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { Bytes, Uint64, type uint64 } from '@algorandfoundation/algorand-typescript'
import { afterEach, describe, expect, test } from 'vitest'
import { ReplayProtectedSig } from './replay-protected-sig.algo'

describe('ReplayProtectedSig Logic Signature', () => {
  const ctx = new TestExecutionContext()
  afterEach(() => ctx.reset())

  const LEASE = Bytes('aaaabbbbccccddddeeeeffffgggghhhh', { length: 32 })

  function setup() {
    ctx.setTemplateVar('LEASE', LEASE)
    ctx.setTemplateVar('EXPIRATION_ROUND', Uint64(100_000))
    return new ReplayProtectedSig()
  }

  /** Helper: run the LogicSig against a payment transaction */
  function evalPayment(lsig: ReplayProtectedSig, overrides: Record<string, unknown> = {}) {
    let result: boolean | uint64
    ctx.txn
      .createScope([ctx.any.txn.payment({ amount: 500_000, fee: 1_000, lease: LEASE, lastValid: Uint64(50_000), ...overrides })])
      .execute(() => {
        result = ctx.executeLogicSig(lsig)
      })
    return result!
  }

  test('approves valid payment', () => {
    expect(evalPayment(setup())).toBe(true)
  })

  test('rejects non-payment transaction', () => {
    const lsig = setup()
    let result: boolean | uint64
    ctx.txn.createScope([ctx.any.txn.assetTransfer()]).execute(() => {
      result = ctx.executeLogicSig(lsig)
    })
    expect(result!).toBe(false)
  })

  test('rejects amount over limit', () => {
    expect(evalPayment(setup(), { amount: 2_000_000 })).toBe(false)
  })

  test('rejects excessive fee', () => {
    expect(evalPayment(setup(), { fee: 10_000 })).toBe(false)
  })

  test('rejects RekeyTo', () => {
    expect(evalPayment(setup(), { rekeyTo: ctx.any.account() })).toBe(false)
  })

  test('rejects CloseRemainderTo', () => {
    expect(evalPayment(setup(), { closeRemainderTo: ctx.any.account() })).toBe(false)
  })

  test('rejects wrong lease', () => {
    expect(evalPayment(setup(), { lease: Bytes('zzzzyyyyxxxxwwwwvvvvuuuuttttssss', { length: 32 }) })).toBe(false)
  })

  test('rejects lastValid past expiration round', () => {
    expect(evalPayment(setup(), { lastValid: Uint64(200_000) })).toBe(false)
  })
})
