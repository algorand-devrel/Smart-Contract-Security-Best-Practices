import type { gtxn } from '@algorandfoundation/algorand-typescript'
import { Contract, Global, Txn, Asset, assert, Uint64, GlobalState, itxn } from '@algorandfoundation/algorand-typescript'
import { gtxn as gtxnFn } from '@algorandfoundation/algorand-typescript'

// VULNERABLE: Does not verify which asset is being transferred
export class VulnerableAssetContract extends Contract {
  public optInToAsset(asset: Asset): void {
    assert(Txn.sender === Global.creatorAddress, 'Only creator')
    itxn.assetTransfer({ assetReceiver: Global.currentApplicationAddress, xferAsset: asset, assetAmount: 0, fee: 0 }).submit()
  }

  public deposit(): void {
    assert(Global.groupSize === Uint64(2))
    const assetXfer = gtxnFn.AssetTransferTxn(Uint64(0))
    assert(assetXfer.assetReceiver === Global.currentApplicationAddress, 'Must send to app')
    // Missing: assert(assetXfer.xferAsset === expectedAsset)
    // Attacker can send any worthless ASA instead of the expected token
  }
}

// FIXED: Accept payment as typed ABI parameter and verify asset ID
export class SecureDepositContract extends Contract {
  public acceptedAsset = GlobalState<Asset>({ key: 'asset' })

  public setAsset(asset: Asset): void {
    assert(Txn.sender === Global.creatorAddress, 'Only creator can set asset')
    this.acceptedAsset.value = asset
  }

  public optInToAsset(asset: Asset): void {
    assert(Txn.sender === Global.creatorAddress, 'Only creator')
    itxn.assetTransfer({ assetReceiver: Global.currentApplicationAddress, xferAsset: asset, assetAmount: 0, fee: 0 }).submit()
  }

  // Accept the payment as a typed ABI parameter
  public deposit(payment: gtxn.AssetTransferTxn): void {
    assert(payment.assetReceiver === Global.currentApplicationAddress, 'Must send to app')
    assert(payment.xferAsset.id === this.acceptedAsset.value.id, 'Wrong asset')
    assert(payment.assetAmount > Uint64(0), 'Must send nonzero amount')
  }
}
