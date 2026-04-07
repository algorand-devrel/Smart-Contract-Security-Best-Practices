import type { uint64 } from "@algorandfoundation/algorand-typescript";
import {
  Account,
  Contract,
  Txn,
  Global,
  BoxMap,
  assert,
  Uint64,
  itxn,
} from "@algorandfoundation/algorand-typescript";

export class PullPatternContract extends Contract {
  // Use BoxMap so users can't delete their pending withdrawal
  public pendingWithdrawals = BoxMap<Account, uint64>({ keyPrefix: "w" });

  // Admin sets up the withdrawal
  public queueWithdrawal(recipient: Account, amount: uint64): void {
    assert(Txn.sender === Global.creatorAddress);
    this.pendingWithdrawals(recipient).value = amount;
  }

  // User pulls their own funds — failure only affects them
  public withdraw(): void {
    assert(this.pendingWithdrawals(Txn.sender).exists, "No pending withdrawal");
    const amount = this.pendingWithdrawals(Txn.sender).value;

    itxn
      .payment({
        receiver: Txn.sender,
        amount: amount,
        fee: Uint64(0),
      })
      .submit();

    this.pendingWithdrawals(Txn.sender).delete();
  }
}
