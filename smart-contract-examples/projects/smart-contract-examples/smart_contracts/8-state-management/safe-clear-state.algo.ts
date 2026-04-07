import type { uint64 } from "@algorandfoundation/algorand-typescript";
import {
  Contract,
  Txn,
  GlobalState,
  LocalState,
  Uint64,
} from "@algorandfoundation/algorand-typescript";

export class SafeClearContract extends Contract {
  public userBalance = LocalState<uint64>({ key: "bal" });
  public unclaimedFunds = GlobalState<uint64>({ key: "unclaimed" });

  public createApplication(): void {
    this.unclaimedFunds.value = Uint64(0);
  }

  public optInToApplication(): void {
    this.userBalance(Txn.sender).value = Uint64(0);
  }

  // The clear state program handles early exit
  public clearStateProgram(): boolean {
    // Track unclaimed funds in global state (accessible during clear)
    const balance = this.userBalance(Txn.sender).value;
    this.unclaimedFunds.value = this.unclaimedFunds.value + balance;
    return true; // Always approve
  }
}
