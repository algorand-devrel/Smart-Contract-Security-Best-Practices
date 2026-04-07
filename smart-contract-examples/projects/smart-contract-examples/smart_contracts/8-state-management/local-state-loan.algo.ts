import type { uint64 } from "@algorandfoundation/algorand-typescript";
import {
  Account,
  Contract,
  Txn,
  LocalState,
  Uint64,
  assert,
} from "@algorandfoundation/algorand-typescript";

// VULNERABLE: User can clear local state to erase their debt
export class VulnerableLoanContract extends Contract {
  public debt = LocalState<uint64>({ key: "debt" });
  public collateral = LocalState<uint64>({ key: "col" });

  public optInToApplication(): void {
    this.debt(Txn.sender).value = Uint64(0);
    this.collateral(Txn.sender).value = Uint64(0);
  }

  public borrow(amount: uint64): void {
    // ... transfer funds to user
    this.debt(Txn.sender).value = this.debt(Txn.sender).value + amount;
  }

  public liquidate(user: Account): void {
    // User can dodge this by clearing local state first
    assert(this.debt(user).value > this.collateral(user).value, "Not undercollateralized");
    // ... seize collateral
  }
}
