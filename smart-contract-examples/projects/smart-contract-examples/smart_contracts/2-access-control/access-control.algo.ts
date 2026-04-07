import { Contract, Txn, Global, assert } from '@algorandfoundation/algorand-typescript'

// VULNERABLE: Update/delete handlers exist but have no access control
export class VulnerableContract extends Contract {
  public updateApplication(): void {
    // No access control — anyone can replace this contract's code
  }

  public deleteApplication(): void {
    // No access control — anyone can delete this contract
  }

  public doSomething(): void {
    // business logic
  }
}

export class SecureContract extends Contract {
  public updateApplication(): void {
    assert(Txn.sender === Global.creatorAddress, 'Only creator can update')
  }

  public deleteApplication(): void {
    assert(Txn.sender === Global.creatorAddress, 'Only creator can delete')
  }

  public doSomething(): void {
    // business logic
  }
}

// SAFE: Guard deletion — creator-only and funds must be drained first
export class SafeDeleteContract extends Contract {
  public deleteApplication(): void {
    assert(Txn.sender === Global.creatorAddress, 'Only creator can delete')
    assert(
      Global.currentApplicationAddress.balance === Global.currentApplicationAddress.minBalance,
      'Drain funds before deleting',
    )
  }

  public doSomething(): void {
    // business logic
  }
}

// Safe by default: no update/delete handlers defined — PuyaTs rejects those calls automatically
export class SafeDefaultContract extends Contract {
  public doSomething(): void {
    // business logic
  }
}
