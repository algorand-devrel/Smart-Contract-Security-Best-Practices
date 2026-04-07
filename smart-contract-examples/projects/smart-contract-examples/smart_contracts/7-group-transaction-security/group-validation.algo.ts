import {
  Contract,
  GlobalState,
  gtxn,
  Global,
  Uint64,
  assert,
  type uint64,
} from "@algorandfoundation/algorand-typescript";

// VULNERABLE: Attacker can pad the group with extra app calls
// to execute this method multiple times for one payment
export class VulnerableGroupContract extends Contract {
  public totalCredits = GlobalState<uint64>({ key: "credits" });

  public createApplication(): void {
    this.totalCredits.value = 0;
  }

  public buyCredit(): void {
    const payment = gtxn.PaymentTxn(Uint64(0)); // Always reads index 0
    assert(
      payment.receiver === Global.currentApplicationAddress,
      "Must pay app",
    );
    // Each app call in the group reads the same payment at index 0
    // Result: attacker gets N credits for 1 payment
    this.totalCredits.value = this.totalCredits.value + Uint64(1);
  }
}

// FIXED: Accept payment as typed ABI parameter
// The ARC-4 router resolves the correct transaction reference
export class SecureGroupContract extends Contract {
  public totalCredits = GlobalState<uint64>({ key: "credits" });

  public createApplication(): void {
    this.totalCredits.value = 0;
  }

  public buyCredit(payment: gtxn.PaymentTxn): void {
    assert(
      payment.receiver === Global.currentApplicationAddress,
      "Must pay app",
    );
    assert(payment.amount >= Uint64(1_000_000), "Insufficient payment");
    // Each app call requires its own paired payment — no double-counting
    this.totalCredits.value = this.totalCredits.value + Uint64(1);
  }
}
