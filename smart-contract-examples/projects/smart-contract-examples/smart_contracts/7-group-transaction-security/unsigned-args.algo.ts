import { Bytes, LogicSig, Txn, Global, TransactionType, type bytes } from '@algorandfoundation/algorand-typescript'

// VULNERABLE: Typed LogicSig parameters are still NOT signed — anyone who sees
// one valid transaction can copy the password argument and reuse it.
export class UnsafeArgSig extends LogicSig {
  public program(password: bytes): boolean {
    return (
      Txn.typeEnum === TransactionType.Payment &&
      Txn.fee <= Global.minTxnFee &&
      Txn.rekeyTo === Global.zeroAddress &&
      Txn.closeRemainderTo === Global.zeroAddress &&
      // "Secret" password — provides zero security because args are public
      password === Bytes('s3cret')
    )
  }
}
