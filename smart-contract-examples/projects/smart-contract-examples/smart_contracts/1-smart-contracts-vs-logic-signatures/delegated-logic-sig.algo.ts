import {
  LogicSig,
  Txn,
  Global,
  Uint64,
  TransactionType,
  TemplateVar,
  Account,
  type bytes,
  type uint64,
} from '@algorandfoundation/algorand-typescript'

// VULNERABLE: Only checks amount — allows rekeying, closing, and replay
export class UnsafePaymentSig extends LogicSig {
  public program(): boolean {
    return Txn.amount <= Uint64(1_000_000)
  }
}

// SAFE: All checks including receiver restriction and replay protection via TemplateVar
export class SafePaymentSig extends LogicSig {
  public program(): boolean {
    return (
      Txn.typeEnum === TransactionType.Payment &&
      Txn.amount <= Uint64(1_000_000) &&
      Txn.fee <= Global.minTxnFee &&
      Txn.rekeyTo === Global.zeroAddress &&
      Txn.closeRemainderTo === Global.zeroAddress &&
      Txn.receiver === TemplateVar<Account>('INTENDED_RECEIVER') &&
      // Lease + exact FirstValid/LastValid = at most one execution
      Txn.lease === TemplateVar<bytes>('LEASE') &&
      Txn.firstValid === TemplateVar<uint64>('FIRST_VALID') &&
      Txn.lastValid === TemplateVar<uint64>('LAST_VALID')
    )
  }
}
