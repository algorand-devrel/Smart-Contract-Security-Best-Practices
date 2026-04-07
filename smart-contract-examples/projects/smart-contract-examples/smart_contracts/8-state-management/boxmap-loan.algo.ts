import type { uint64 } from "@algorandfoundation/algorand-typescript";
import {
  Account,
  Contract,
  Txn,
  BoxMap,
  Uint64,
  assert,
} from "@algorandfoundation/algorand-typescript";

// SAFE: Debt is stored in boxes — user cannot delete it
export class SecureLoanContract extends Contract {
  public debt = BoxMap<Account, uint64>({ keyPrefix: "debt" });
  public collateral = BoxMap<Account, uint64>({ keyPrefix: "col" });

  public register(): void {
    this.debt(Txn.sender).value = Uint64(0);
    this.collateral(Txn.sender).value = Uint64(0);
  }

  public borrow(amount: uint64): void {
    // ... transfer funds to user
    this.debt(Txn.sender).value = this.debt(Txn.sender).value + amount;
  }

  public liquidate(user: Account): void {
    // User cannot erase their debt — BoxMap persists regardless of ClearState
    assert(this.debt(user).value > this.collateral(user).value, "Not undercollateralized");
    // ... seize collateral
  }
}
