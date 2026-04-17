import type { bytes } from '@algorandfoundation/algorand-typescript'
import { Account, Bytes, Contract, Global, GlobalState, Txn, assert } from '@algorandfoundation/algorand-typescript'

// VULNERABLE: Privileged business logic is exposed as a permissionless method.
export class VulnerableTreasuryContract extends Contract {
  public treasury = GlobalState<bytes>({ key: 'treasury' })

  public createApplication(): void {
    this.treasury.value = Global.creatorAddress.bytes
  }

  public setTreasury(newTreasury: Account): void {
    this.treasury.value = newTreasury.bytes
  }
}

// SAFE: The contract explicitly defines and enforces an authorization policy.
export class SafeTreasuryContract extends Contract {
  public admin = GlobalState<bytes>({ key: 'admin' })
  public treasury = GlobalState<bytes>({ key: 'treasury' })

  public createApplication(): void {
    this.admin.value = Global.creatorAddress.bytes
    this.treasury.value = Global.creatorAddress.bytes
  }

  private requireAdmin(): void {
    assert(Txn.sender.bytes === this.admin.value, 'Admin only')
  }

  public setTreasury(newTreasury: Account): void {
    this.requireAdmin()
    this.treasury.value = newTreasury.bytes
  }

  public rotateAdmin(newAdmin: Account): void {
    this.requireAdmin()
    this.admin.value = newAdmin.bytes
  }
}

// SAFE: Admin rotation itself is permissioned and requires acceptance by the new admin.
export class RotatingAdminContract extends Contract {
  public admin = GlobalState<bytes>({ key: 'admin' })
  public pendingAdmin = GlobalState<bytes>({ key: 'pending' })

  public createApplication(): void {
    this.admin.value = Global.creatorAddress.bytes
    this.pendingAdmin.value = Bytes('')
  }

  private requireAdmin(): void {
    assert(Txn.sender.bytes === this.admin.value, 'Admin only')
  }

  public proposeAdmin(newAdmin: Account): void {
    this.requireAdmin()
    this.pendingAdmin.value = newAdmin.bytes
  }

  public acceptAdmin(): void {
    assert(Txn.sender.bytes === this.pendingAdmin.value, 'Pending admin only')
    this.admin.value = Txn.sender.bytes
    this.pendingAdmin.value = Bytes('')
  }

  public cancelAdminRotation(): void {
    this.requireAdmin()
    this.pendingAdmin.value = Bytes('')
  }
}
