import { Bytes, LogicSig, Txn, Global, TransactionType, op } from '@algorandfoundation/algorand-typescript'

// VULNERABLE: LogicSig arguments are NOT signed — anyone who sees one valid
// transaction can copy the "password" argument and reuse it to drain the escrow.
export class UnsafeArgSig extends LogicSig {
  public program(): boolean {
    return (
      Txn.typeEnum === TransactionType.Payment &&
      Txn.fee <= Global.minTxnFee &&
      Txn.rekeyTo === Global.zeroAddress &&
      Txn.closeRemainderTo === Global.zeroAddress &&
      // "Secret" password — provides zero security because args are public
      op.arg(0) === Bytes('s3cret')
    )
  }
}
