import {
  LogicSig,
  Txn,
  Global,
  Uint64,
  TransactionType,
} from '@algorandfoundation/algorand-typescript'

// VULNERABLE: Missing RekeyTo check
export class VulnerableRekey extends LogicSig {
  public program(): boolean {
    return (
      Txn.typeEnum === TransactionType.Payment &&
      Txn.amount <= Uint64(500_000) &&
      Txn.fee <= Global.minTxnFee
    );
    // Missing: && Txn.rekeyTo === Global.zeroAddress
  }
}

export class SafeLogicSig extends LogicSig {
  public program(): boolean {
    return (
      Txn.typeEnum === TransactionType.Payment &&
      Txn.amount <= Uint64(500_000) &&
      Txn.fee <= Global.minTxnFee &&
      Txn.rekeyTo === Global.zeroAddress && // Prevent rekeying
      Txn.closeRemainderTo === Global.zeroAddress // Prevent draining
    );
  }
}
