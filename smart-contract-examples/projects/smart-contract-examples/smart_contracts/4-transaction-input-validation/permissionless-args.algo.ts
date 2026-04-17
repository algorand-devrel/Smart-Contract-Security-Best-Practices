import type { bytes, uint64 } from '@algorandfoundation/algorand-typescript'
import { Contract, Uint64, assert } from '@algorandfoundation/algorand-typescript'

const MODE_EXACT_IN = Uint64(0)
const MODE_EXACT_OUT = Uint64(1)

// VULNERABLE: A permissionless method accepts malformed arguments without semantic checks.
export class UnsafePermissionlessArgsContract extends Contract {
  public createApplication(): void {}

  public submitCommitment(commitment: bytes): void {
    // No semantic validation.
  }

  public setSlippage(slippageBps: uint64): void {
    // No semantic validation.
  }

  public chooseMode(mode: uint64): void {
    // No semantic validation.
  }
}

// SAFE: Each permissionless argument is validated according to its semantics.
export class SafePermissionlessArgsContract extends Contract {
  public createApplication(): void {}

  public submitCommitment(commitment: bytes): void {
    assert(commitment.length === Uint64(32), 'Commitment must be 32 bytes')
  }

  public setSlippage(slippageBps: uint64): void {
    assert(slippageBps <= Uint64(10_000), 'Slippage out of range')
  }

  public chooseMode(mode: uint64): void {
    assert(mode === MODE_EXACT_IN || mode === MODE_EXACT_OUT, 'Invalid mode')
  }
}
