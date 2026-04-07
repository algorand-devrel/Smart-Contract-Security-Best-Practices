import type { uint64 } from '@algorandfoundation/algorand-typescript'
import { Contract, Txn, Global, GlobalState, assert, Uint64 } from '@algorandfoundation/algorand-typescript'

export class PausableContract extends Contract {
  public paused = GlobalState<uint64>({ key: 'paused' })
  public totalDeposits = GlobalState<uint64>({ key: 'deposits' })

  public createApplication(): void {
    this.paused.value = 0
    this.totalDeposits.value = 0
  }

  public pause(): void {
    assert(Txn.sender === Global.creatorAddress, 'Admin only')
    this.paused.value = 1
  }

  public unpause(): void {
    assert(Txn.sender === Global.creatorAddress, 'Admin only')
    this.paused.value = 0
  }

  private requireNotPaused(): void {
    assert(this.paused.value === Uint64(0), 'Contract is paused')
  }

  public deposit(amount: uint64): void {
    this.requireNotPaused()
    this.totalDeposits.value = this.totalDeposits.value + amount
  }

  public isPaused(): uint64 {
    return this.paused.value
  }

  public getTotalDeposits(): uint64 {
    return this.totalDeposits.value
  }
}
