import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { Bytes, Uint64, type uint64 } from '@algorandfoundation/algorand-typescript'
import { afterEach, describe, expect, test } from 'vitest'
import { EscrowSig } from './escrow-logic-sig.algo'

describe('Escrow Logic Signature', () => {
  const ctx = new TestExecutionContext()
  afterEach(() => ctx.reset())

  const LEASE = Bytes('aaaabbbbccccddddeeeeffffgggghhhh', { length: 32 })
  let recipient: ReturnType<typeof ctx.any.account>

  function setup() {
    recipient = ctx.any.account()
    ctx.setTemplateVar('RECIPIENT', recipient)
    ctx.setTemplateVar('MAX_AMOUNT', Uint64(1_000_000))
    ctx.setTemplateVar('LEASE', LEASE)
    ctx.setTemplateVar('FIRST_VALID', Uint64(1_000))
    ctx.setTemplateVar('LAST_VALID', Uint64(100_000))
    return new EscrowSig()
  }

  /** Valid payment that satisfies all escrow checks */
  function validPayment(overrides: Record<string, unknown> = {}) {
    return { receiver: recipient, lease: LEASE, firstValid: Uint64(1_000), lastValid: Uint64(100_000), ...overrides }
  }

  /** Helper: run the escrow LogicSig against a payment transaction */
  function evalPayment(lsig: EscrowSig, overrides: Record<string, unknown> = {}) {
    let result: boolean | uint64
    ctx.txn.createScope([ctx.any.txn.payment({ amount: 500_000, fee: 1_000, ...validPayment(overrides) })]).execute(() => {
      result = ctx.executeLogicSig(lsig)
    })
    return result!
  }

  test('approves valid payment', () => {
    expect(evalPayment(setup())).toBe(true)
  })

  test('rejects wrong recipient', () => {
    expect(evalPayment(setup(), { receiver: ctx.any.account() })).toBe(false)
  })

  test('rejects amount exceeding max', () => {
    expect(evalPayment(setup(), { amount: 2_000_000 })).toBe(false)
  })

  test('rejects RekeyTo', () => {
    expect(evalPayment(setup(), { rekeyTo: ctx.any.account() })).toBe(false)
  })

  test('rejects CloseRemainderTo', () => {
    expect(evalPayment(setup(), { closeRemainderTo: ctx.any.account() })).toBe(false)
  })

  test('rejects excessive fee', () => {
    expect(evalPayment(setup(), { fee: 10_000 })).toBe(false)
  })

  test('rejects wrong lease', () => {
    expect(evalPayment(setup(), { lease: Bytes('zzzzyyyyxxxxwwwwvvvvuuuuttttssss', { length: 32 }) })).toBe(false)
  })

  test('rejects wrong firstValid (replay protection)', () => {
    expect(evalPayment(setup(), { firstValid: Uint64(999) })).toBe(false)
  })

  test('rejects wrong lastValid (replay protection)', () => {
    expect(evalPayment(setup(), { lastValid: Uint64(200_000) })).toBe(false)
  })

  test('rejects non-payment transaction', () => {
    const lsig = setup()
    let result: boolean | uint64
    ctx.txn.createScope([ctx.any.txn.assetTransfer()]).execute(() => {
      result = ctx.executeLogicSig(lsig)
    })
    expect(result!).toBe(false)
  })
})
