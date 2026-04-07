import type { uint64, biguint } from '@algorandfoundation/algorand-typescript'
import { Contract, assert, Uint64, GlobalState, BigUint, Bytes, op } from '@algorandfoundation/algorand-typescript'

const MAX_UINT64: uint64 = Uint64(18_446_744_073_709_551_615n)

export class ArithmeticContract extends Contract {
  public userBalance = GlobalState<uint64>({ key: 'bal' })

  public createApplication(): void {
    this.userBalance.value = 0
  }

  // VULNERABLE: If a + b overflows uint64, the transaction fails (AVM panics)
  public unsafeAdd(a: uint64, b: uint64): uint64 {
    return a + b // Panics if result > 2^64 - 1
  }

  // FIXED: Check before operating
  public safeAdd(a: uint64, b: uint64): uint64 {
    assert(a <= MAX_UINT64 - b, 'Overflow')
    return a + b
  }

  // VULNERABLE: Panics if balance < amount (underflow)
  public unsafeWithdraw(amount: uint64): void {
    this.userBalance.value = this.userBalance.value - amount
  }

  // FIXED: Check before subtracting
  public safeWithdraw(amount: uint64): void {
    assert(this.userBalance.value >= amount, 'Insufficient balance')
    this.userBalance.value = this.userBalance.value - amount
  }

  public setBalance(amount: uint64): void {
    this.userBalance.value = amount
  }

  public getBalance(): uint64 {
    return this.userBalance.value
  }

  // BigUInt for safe multiplication that won't overflow
  public safeMultiplyDivide(a: uint64, b: uint64, denominator: uint64): uint64 {
    assert(denominator > Uint64(0), 'Division by zero')
    const bigA: biguint = BigUint(a)
    const bigB: biguint = BigUint(b)
    const bigDenom: biguint = BigUint(denominator)
    const result: biguint = (bigA * bigB) / bigDenom
    return op.btoi(Bytes(result))
  }
}
