import type { bytes, uint64 } from "@algorandfoundation/algorand-typescript";
import {
  BoxMap,
  Contract,
  Global,
  Txn,
  Uint64,
  assert,
  itxn,
} from "@algorandfoundation/algorand-typescript";

export class StorageRefundContract extends Contract {
  public entries = BoxMap<bytes, uint64>({ keyPrefix: "entry" });

  public storeEntry(key: bytes, value: uint64): void {
    assert(!this.entries(key).exists, "Entry already exists");
    this.entries(key).value = value;
  }

  public deleteEntry(key: bytes): uint64 {
    assert(this.entries(key).exists, "Entry not found");

    const app = Global.currentApplicationAddress;
    const preMbr: uint64 = app.minBalance;
    this.entries(key).delete();
    const postMbr: uint64 = app.minBalance;
    const released: uint64 = preMbr - postMbr;

    if (released > Uint64(0)) {
      itxn
        .payment({
          receiver: Txn.sender,
          amount: released,
          fee: Uint64(0),
        })
        .submit();
    }

    return released;
  }
}
