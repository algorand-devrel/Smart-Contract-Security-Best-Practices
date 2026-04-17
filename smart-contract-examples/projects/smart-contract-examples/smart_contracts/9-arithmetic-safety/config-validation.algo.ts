import type { uint64 } from '@algorandfoundation/algorand-typescript'
import { Contract, Global, GlobalState, Txn, Uint64, assert } from '@algorandfoundation/algorand-typescript'

const MAX_UINT64: uint64 = Uint64(18_446_744_073_709_551_615n)

// VULNERABLE: Configuration can store values that later trigger divide-by-zero or overflow.
export class VulnerableRewardsConfigContract extends Contract {
  public maxEligibleDeposits = GlobalState<uint64>({ key: 'max' })
  public rewardRate = GlobalState<uint64>({ key: 'rate' })
  public rewardScale = GlobalState<uint64>({ key: 'scale' })

  public createApplication(): void {
    this.maxEligibleDeposits.value = Uint64(0)
    this.rewardRate.value = Uint64(0)
    this.rewardScale.value = Uint64(1)
  }

  public configure(maxEligibleDeposits: uint64, rewardRate: uint64, rewardScale: uint64): void {
    assert(Txn.sender === Global.creatorAddress, 'Admin only')
    this.maxEligibleDeposits.value = maxEligibleDeposits
    this.rewardRate.value = rewardRate
    this.rewardScale.value = rewardScale
  }

  // VULNERABLE: The configured envelope can be invalid, so even a "valid" payout
  // at the configured maximum can fail at runtime.
  public calculatePayout(eligibleDeposits: uint64): uint64 {
    assert(eligibleDeposits <= this.maxEligibleDeposits.value, 'Exceeds configured limit')
    return (eligibleDeposits * this.rewardRate.value) / this.rewardScale.value
  }
}

// SAFE: Reject numerically unsafe configurations before they reach persistent state.
export class SafeRewardsConfigContract extends Contract {
  public maxEligibleDeposits = GlobalState<uint64>({ key: 'max' })
  public rewardRate = GlobalState<uint64>({ key: 'rate' })
  public rewardScale = GlobalState<uint64>({ key: 'scale' })

  public createApplication(): void {
    this.maxEligibleDeposits.value = Uint64(0)
    this.rewardRate.value = Uint64(0)
    this.rewardScale.value = Uint64(1)
  }

  public configure(maxEligibleDeposits: uint64, rewardRate: uint64, rewardScale: uint64): void {
    assert(Txn.sender === Global.creatorAddress, 'Admin only')
    assert(rewardScale > Uint64(0), 'Scale must be nonzero')
    if (rewardRate > Uint64(0)) {
      assert(maxEligibleDeposits <= MAX_UINT64 / rewardRate, 'Configuration can overflow')
    }

    this.maxEligibleDeposits.value = maxEligibleDeposits
    this.rewardRate.value = rewardRate
    this.rewardScale.value = rewardScale
  }

  public calculatePayout(eligibleDeposits: uint64): uint64 {
    assert(eligibleDeposits <= this.maxEligibleDeposits.value, 'Exceeds configured limit')
    return (eligibleDeposits * this.rewardRate.value) / this.rewardScale.value
  }
}

// SAFE: Validate numeric invariants at configuration time, then keep runtime guards cheap.
export class BoundedRewardsContract extends Contract {
  public maxEligibleDeposits = GlobalState<uint64>({ key: 'max' })
  public rewardRate = GlobalState<uint64>({ key: 'rate' })
  public rewardScale = GlobalState<uint64>({ key: 'scale' })
  public eligibleDeposits = GlobalState<uint64>({ key: 'total' })

  public createApplication(): void {
    this.maxEligibleDeposits.value = Uint64(0)
    this.rewardRate.value = Uint64(0)
    this.rewardScale.value = Uint64(1)
    this.eligibleDeposits.value = Uint64(0)
  }

  public configure(maxEligibleDeposits: uint64, rewardRate: uint64, rewardScale: uint64): void {
    assert(Txn.sender === Global.creatorAddress, 'Admin only')
    assert(rewardScale > Uint64(0), 'Scale must be nonzero')
    if (rewardRate > Uint64(0)) {
      assert(maxEligibleDeposits <= MAX_UINT64 / rewardRate, 'Configuration can overflow')
    }

    this.maxEligibleDeposits.value = maxEligibleDeposits
    this.rewardRate.value = rewardRate
    this.rewardScale.value = rewardScale
  }

  public recordEligibleDeposits(amount: uint64): void {
    assert(this.eligibleDeposits.value <= this.maxEligibleDeposits.value - amount, 'Exceeds configured limit')
    this.eligibleDeposits.value = this.eligibleDeposits.value + amount
  }

  public calculatePayout(): uint64 {
    return (this.eligibleDeposits.value * this.rewardRate.value) / this.rewardScale.value
  }
}
