import type { uint64, bytes } from '@algorandfoundation/algorand-typescript'
import { Contract, Txn, Global, GlobalState, assert, Uint64 } from '@algorandfoundation/algorand-typescript'

const UPGRADE_DELAY: uint64 = Uint64(86400) // 24 hours in seconds

export class UpgradeableContract extends Contract {
  public upgradeHash = GlobalState<bytes>({ key: 'uhash' })
  public upgradeTimestamp = GlobalState<uint64>({ key: 'utime' })
  public upgradeReady = GlobalState<uint64>({ key: 'uready' })
  public version = GlobalState<uint64>({ key: 'ver' })

  public createApplication(): void {
    this.upgradeReady.value = 0
    this.upgradeTimestamp.value = 0
    this.version.value = 1
  }

  // Step 1: Schedule an upgrade (admin only)
  public scheduleUpgrade(programHash: bytes): void {
    assert(Txn.sender === Global.creatorAddress, 'Admin only')
    this.upgradeHash.value = programHash
    this.upgradeTimestamp.value = Global.latestTimestamp
    this.upgradeReady.value = 1
  }

  // Step 2: Apply the upgrade after delay
  public updateApplication(): void {
    assert(Txn.sender === Global.creatorAddress, 'Admin only')
    assert(this.upgradeReady.value === Uint64(1), 'No upgrade scheduled')

    // Enforce timelock
    const elapsed: uint64 = Global.latestTimestamp - this.upgradeTimestamp.value
    assert(elapsed >= UPGRADE_DELAY, 'Timelock not expired')

    // Clear the upgrade schedule
    this.upgradeReady.value = 0
  }

  // Cancel a scheduled upgrade
  public cancelUpgrade(): void {
    assert(Txn.sender === Global.creatorAddress, 'Admin only')
    this.upgradeReady.value = 0
  }

  public getVersion(): uint64 {
    return this.version.value
  }

  public isUpgradeScheduled(): uint64 {
    return this.upgradeReady.value
  }
}
