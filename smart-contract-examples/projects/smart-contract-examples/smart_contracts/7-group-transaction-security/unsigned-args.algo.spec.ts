import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { Bytes, type uint64 } from '@algorandfoundation/algorand-typescript'
import { afterEach, describe, expect, test } from 'vitest'
import { UnsafeArgSig } from './unsigned-args.algo'

describe('UnsafeArgSig — unsigned LogicSig arguments', () => {
  const ctx = new TestExecutionContext()
  afterEach(() => ctx.reset())

  /** Helper: run the LogicSig against a payment transaction with the given args */
  function evalPayment(lsig: UnsafeArgSig, ...args: unknown[]) {
    let result: boolean | uint64
    ctx.txn.createScope([ctx.any.txn.payment({ amount: 500_000, fee: 1_000 })]).execute(() => {
      result = ctx.executeLogicSig(lsig, ...args)
    })
    return result!
  }

  test('approves payment with correct password arg', () => {
    const lsig = new UnsafeArgSig()
    expect(evalPayment(lsig, Bytes('s3cret'))).toBe(true)
  })

  test('rejects payment with wrong password arg', () => {
    const lsig = new UnsafeArgSig()
    expect(evalPayment(lsig, Bytes('wrong'))).toBe(false)
  })

  test('rejects non-payment transaction', () => {
    const lsig = new UnsafeArgSig()
    let result: boolean | uint64
    ctx.txn.createScope([ctx.any.txn.assetTransfer()]).execute(() => {
      result = ctx.executeLogicSig(lsig, Bytes('s3cret'))
    })
    expect(result!).toBe(false)
  })

  test('rejects RekeyTo even with correct password', () => {
    const lsig = new UnsafeArgSig()
    let result: boolean | uint64
    ctx.txn.createScope([ctx.any.txn.payment({ amount: 500_000, fee: 1_000, rekeyTo: ctx.any.account() })]).execute(() => {
      result = ctx.executeLogicSig(lsig, Bytes('s3cret'))
    })
    expect(result!).toBe(false)
  })
})
