import {
  LogicSig,
  Txn,
  Global,
  TransactionType,
  TemplateVar,
  Account,
  type uint64,
  type bytes,
} from '@algorandfoundation/algorand-typescript'

// SAFE: Contract Account escrow — the compiled program hash IS the escrow address
export class EscrowSig extends LogicSig {
  public program(): boolean {
    return (
      Txn.typeEnum === TransactionType.Payment &&
      Txn.receiver === TemplateVar<Account>('RECIPIENT') &&
      Txn.amount <= TemplateVar<uint64>('MAX_AMOUNT') &&
      Txn.rekeyTo === Global.zeroAddress &&
      Txn.closeRemainderTo === Global.zeroAddress &&
      Txn.fee <= Global.minTxnFee &&
      // Lease + exact FirstValid/LastValid = at most one execution
      Txn.lease === TemplateVar<bytes>('LEASE') &&
      Txn.firstValid === TemplateVar<uint64>('FIRST_VALID') &&
      Txn.lastValid === TemplateVar<uint64>('LAST_VALID')
    )
  }
}
