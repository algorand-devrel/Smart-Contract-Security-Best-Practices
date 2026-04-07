import type { uint64 } from "@algorandfoundation/algorand-typescript";
import {
  Contract,
  Global,
  Uint64,
  assert,
} from "@algorandfoundation/algorand-typescript";

// VULNERABLE: Hard-coded minimum balance breaks when the contract
// opts into assets, creates boxes, or adds local state schemas
export class VulnerableMinBalanceContract extends Contract {
  public withdraw(amount: uint64): void {
    const app = Global.currentApplicationAddress;
    assert(app.balance - Uint64(100_000) >= amount, "Insufficient contract balance");
    // ... send inner payment
  }
}

// SAFE: Uses the AVM's min_balance opcode to calculate spendable balance dynamically
export class SafeMinBalanceContract extends Contract {
  public withdraw(amount: uint64): void {
    const app = Global.currentApplicationAddress;
    assert(app.balance - app.minBalance >= amount, "Insufficient contract balance");
    // ... send inner payment
  }
}
