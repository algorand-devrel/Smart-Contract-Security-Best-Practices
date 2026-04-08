import {
  LogicSig, Txn, Global, Uint64, TransactionType, TemplateVar, Account, type bytes, type uint64,
} from "@algorandfoundation/algorand-typescript";

// VULNERABLE: Checks everything except fee — allows fee draining
export class UnboundedFeeSig extends LogicSig {
  public program(): boolean {
    return (
      Txn.typeEnum === TransactionType.Payment &&
      Txn.amount <= Uint64(1_000_000) &&
      Txn.receiver === TemplateVar<Account>("INTENDED_RECEIVER") &&
      Txn.rekeyTo === Global.zeroAddress &&
      Txn.closeRemainderTo === Global.zeroAddress &&
      Txn.lease === TemplateVar<bytes>("LEASE")
    );
  }
}

// SAFE: All checks including fee bound and replay protection
export class BoundedFeeSig extends LogicSig {
  public program(): boolean {
    return (
      Txn.typeEnum === TransactionType.Payment &&
      Txn.amount <= Uint64(1_000_000) &&
      Txn.fee <= Global.minTxnFee && // Added: caps fee to prevent draining
      Txn.receiver === TemplateVar<Account>("INTENDED_RECEIVER") &&
      Txn.rekeyTo === Global.zeroAddress &&
      Txn.closeRemainderTo === Global.zeroAddress &&
      // Lease + exact FirstValid/LastValid = at most one execution
      Txn.lease === TemplateVar<bytes>("LEASE") &&
      Txn.firstValid === TemplateVar<uint64>("FIRST_VALID") &&
      Txn.lastValid === TemplateVar<uint64>("LAST_VALID")
    );
  }
}
