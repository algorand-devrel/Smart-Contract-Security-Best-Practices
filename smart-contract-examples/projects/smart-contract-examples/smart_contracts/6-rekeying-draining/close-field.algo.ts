import type { uint64 } from '@algorandfoundation/algorand-typescript'
import { Account, Contract, Txn, Global, Uint64, assert, itxn } from '@algorandfoundation/algorand-typescript'

export class CloseFieldContract extends Contract {
  // VULNERABLE: User-controlled close field on inner transaction
  public unsafeTransfer(receiver: Account, closeTo: Account): void {
    assert(Txn.sender === Global.creatorAddress, 'Creator only')
    itxn
      .payment({
        receiver: receiver,
        amount: Uint64(0),
        closeRemainderTo: closeTo, // Attacker drains the app account!
        fee: Uint64(0),
      })
      .submit()
  }

  // SAFE: Never expose close/rekey fields to callers
  public safeTransfer(receiver: Account, amount: uint64): void {
    assert(Txn.sender === Global.creatorAddress, 'Creator only')
    itxn
      .payment({
        receiver: receiver,
        amount: amount,
        fee: Uint64(0),
        // closeRemainderTo and rekeyTo are intentionally omitted
      })
      .submit()
  }
}
