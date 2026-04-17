import type { uint64 } from '@algorandfoundation/algorand-typescript'
import { Contract, GlobalState, Uint64, assert } from '@algorandfoundation/algorand-typescript'

const PHASE_FUNDING = Uint64(0)
const PHASE_TRADING = Uint64(1)
const PHASE_SETTLEMENT = Uint64(2)
const PHASE_CLOSED = Uint64(3)

// VULNERABLE: Independent flags allow overlapping states.
export class VulnerableLifecycleContract extends Contract {
  public saleOpen = GlobalState<uint64>({ key: 'sale' })
  public settlementOpen = GlobalState<uint64>({ key: 'settle' })
  public totalOrders = GlobalState<uint64>({ key: 'orders' })

  public createApplication(): void {
    this.saleOpen.value = Uint64(0)
    this.settlementOpen.value = Uint64(0)
    this.totalOrders.value = Uint64(0)
  }

  public openSale(): void {
    this.saleOpen.value = Uint64(1)
  }

  public openSettlement(): void {
    // VULNERABLE: Enables settlement without disabling sale,
    // so the app can be in two phases at once.
    this.settlementOpen.value = Uint64(1)
  }

  public buy(amount: uint64): void {
    assert(this.saleOpen.value === Uint64(1), 'Sale closed')
    this.totalOrders.value = this.totalOrders.value + amount
  }

  public settle(): void {
    // If both flags are 1, buy() and settle() are simultaneously valid.
    assert(this.settlementOpen.value === Uint64(1), 'Settlement closed')
  }
}

// SAFE: One phase variable defines mutually exclusive states and guarded transitions.
export class SafeLifecycleContract extends Contract {
  public phase = GlobalState<uint64>({ key: 'phase' })
  public totalOrders = GlobalState<uint64>({ key: 'orders' })

  public createApplication(): void {
    this.phase.value = PHASE_FUNDING
    this.totalOrders.value = Uint64(0)
  }

  private requirePhase(expected: uint64): void {
    assert(this.phase.value === expected, 'Wrong state')
  }

  public openTrading(): void {
    this.requirePhase(PHASE_FUNDING)
    this.phase.value = PHASE_TRADING
  }

  public openSettlement(): void {
    this.requirePhase(PHASE_TRADING)
    this.phase.value = PHASE_SETTLEMENT
  }

  public buy(amount: uint64): void {
    this.requirePhase(PHASE_TRADING)
    this.totalOrders.value = this.totalOrders.value + amount
  }

  public settle(): void {
    this.requirePhase(PHASE_SETTLEMENT)
    this.phase.value = PHASE_CLOSED
  }
}

// SAFE: Centralize state guards so transitions stay consistent across methods.
export class PhaseGuardContract extends Contract {
  public phase = GlobalState<uint64>({ key: 'phase' })

  public createApplication(): void {
    this.phase.value = PHASE_FUNDING
  }

  private requirePhase(expected: uint64): void {
    assert(this.phase.value === expected, 'Wrong state')
  }

  private transitionTo(expected: uint64, next: uint64): void {
    this.requirePhase(expected)
    this.phase.value = next
  }

  public activate(): void {
    this.transitionTo(PHASE_FUNDING, PHASE_TRADING)
  }

  public pauseForSettlement(): void {
    this.transitionTo(PHASE_TRADING, PHASE_SETTLEMENT)
  }

  public finalize(): void {
    this.transitionTo(PHASE_SETTLEMENT, PHASE_CLOSED)
  }
}
