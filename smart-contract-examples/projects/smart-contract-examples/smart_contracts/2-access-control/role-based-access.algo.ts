import type { uint64, bytes } from '@algorandfoundation/algorand-typescript'
import { Account, Contract, BoxMap, Txn, Global, assert, Uint64, Bytes } from '@algorandfoundation/algorand-typescript'

const ROLE_ADMIN = Bytes('admin')
const ROLE_OPERATOR = Bytes('operator')

export class RoleBasedContract extends Contract {
  // BoxMap keyed by role+address, value is 1 (has role) or absent
  public roles = BoxMap<bytes, uint64>({ keyPrefix: 'role' })

  public createApplication(): void {
    // Creator is implicitly admin — box storage requires MBR
    // which isn't available at creation time, so we check
    // Global.creatorAddress in hasRole instead.
  }

  private hasRole(role: bytes, account: Account): boolean {
    // Creator always has admin role
    if (role === ROLE_ADMIN && account === Global.creatorAddress) {
      return true
    }
    const key = role.concat(account.bytes)
    return this.roles(key).exists
  }

  private requireRole(role: bytes): void {
    assert(this.hasRole(role, Txn.sender), 'Missing required role')
  }

  public grantRole(role: bytes, account: Account): void {
    this.requireRole(ROLE_ADMIN)
    this.roles(role.concat(account.bytes)).value = Uint64(1)
  }

  public revokeRole(role: bytes, account: Account): void {
    this.requireRole(ROLE_ADMIN)
    const key = role.concat(account.bytes)
    if (this.roles(key).exists) {
      this.roles(key).delete()
    }
  }

  public performOperation(): void {
    this.requireRole(ROLE_OPERATOR)
  }

  public updateApplication(): void {
    this.requireRole(ROLE_ADMIN)
  }

  public deleteApplication(): void {
    this.requireRole(ROLE_ADMIN)
  }
}
