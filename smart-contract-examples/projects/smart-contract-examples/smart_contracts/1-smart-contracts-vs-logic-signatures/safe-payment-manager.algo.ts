import type { uint64 } from '@algorandfoundation/algorand-typescript'
import { Account, Contract, Txn, Global, assert, Uint64, itxn } from '@algorandfoundation/algorand-typescript'

export class SafePaymentManager extends Contract {
  public authorizePayment(receiver: Account, amount: uint64): void {
    assert(Txn.sender === Global.creatorAddress, "Only creator can authorize");
    assert(amount <= Uint64(1_000_000), "Amount exceeds limit");

    itxn
      .payment({
        receiver: receiver,
        amount: amount,
        fee: Uint64(0),
      })
      .submit();
  }
}
