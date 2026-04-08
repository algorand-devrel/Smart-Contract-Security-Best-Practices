import {
  LogicSig,
  Txn,
  Global,
  TransactionType,
  TemplateVar,
  Uint64,
  type uint64,
  type bytes,
} from "@algorandfoundation/algorand-typescript";

export class ReplayProtectedSig extends LogicSig {
  public program(): boolean {
    return (
      Txn.typeEnum === TransactionType.Payment &&
      Txn.amount <= Uint64(1_000_000) &&
      Txn.fee <= Global.minTxnFee &&
      Txn.rekeyTo === Global.zeroAddress &&
      Txn.closeRemainderTo === Global.zeroAddress &&
      // Lease + exact FirstValid/LastValid = at most one execution
      Txn.lease === TemplateVar<bytes>("LEASE") &&
      Txn.firstValid === TemplateVar<uint64>("FIRST_VALID") &&
      Txn.lastValid === TemplateVar<uint64>("LAST_VALID")
    );
  }
}
