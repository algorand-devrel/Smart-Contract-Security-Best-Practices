import type { uint64 } from '@algorandfoundation/algorand-typescript'
import { Account, Contract, Txn, Global, GlobalState, LocalState, BoxMap, assert, itxn } from '@algorandfoundation/algorand-typescript'

// Pattern: Track forfeited value when users clear state
export class SafeClearContract extends Contract {
  userBalance = LocalState<uint64>({ key: 'bal' })
  forfeitedFunds = GlobalState<uint64>({ key: 'forfeited' })

  public createApplication(): void {
    this.forfeitedFunds.value = 0
  }

  public optInToApplication(): void {
    this.userBalance(Txn.sender).value = 0
  }

  public setBalance(amount: uint64): void {
    this.userBalance(Txn.sender).value = amount
  }

  public getBalance(): uint64 {
    return this.userBalance(Txn.sender).value
  }

  public getForfeited(): uint64 {
    return this.forfeitedFunds.value
  }

  clearStateProgram(): boolean {
    const balance: uint64 = this.userBalance(Txn.sender).value
    this.forfeitedFunds.value = this.forfeitedFunds.value + balance
    return true
  }
}

// Pattern: Pull pattern — users withdraw their own funds
export class PullPatternContract extends Contract {
  pendingWithdrawals = BoxMap<Account, uint64>({ keyPrefix: 'w' })

  public queueWithdrawal(recipient: Account, amount: uint64): void {
    assert(Txn.sender === Global.creatorAddress, 'Admin only')
    this.pendingWithdrawals(recipient).value = amount
  }

  public withdraw(): void {
    assert(this.pendingWithdrawals(Txn.sender).exists, 'No pending withdrawal')
    const amount: uint64 = this.pendingWithdrawals(Txn.sender).value

    itxn
      .payment({
        receiver: Txn.sender,
        amount: amount,
        fee: 0,
      })
      .submit()

    this.pendingWithdrawals(Txn.sender).delete()
  }

  public hasPending(account: Account): boolean {
    return this.pendingWithdrawals(account).exists
  }
}
