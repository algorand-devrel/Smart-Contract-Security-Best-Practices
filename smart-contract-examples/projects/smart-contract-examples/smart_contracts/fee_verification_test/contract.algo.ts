import type { uint64 } from '@algorandfoundation/algorand-typescript'
import { Contract, Global, Txn, Uint64, itxn } from '@algorandfoundation/algorand-typescript'

// Explicitly sets fee = 0 on the inner transaction
export class FeeExplicitZero extends Contract {
  public ping(amount: uint64): void {
    itxn
      .payment({
        receiver: Txn.sender,
        amount: amount,
        fee: Uint64(0),
      })
      .submit()
  }
}

// Omits the fee field entirely — relies on compiler default
export class FeeOmitted extends Contract {
  public ping(amount: uint64): void {
    itxn
      .payment({
        receiver: Txn.sender,
        amount: amount,
      })
      .submit()
  }
}
