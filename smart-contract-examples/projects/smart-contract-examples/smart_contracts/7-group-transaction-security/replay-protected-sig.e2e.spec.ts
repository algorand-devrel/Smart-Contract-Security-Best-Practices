import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { TealTemplateParams } from '@algorandfoundation/algokit-utils/types/app'
import { randomBytes } from 'crypto'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const ARTIFACTS = join(__dirname, '..', 'artifacts', '7-group-transaction-security')

describe('ReplayProtectedSig — e2e on localnet', () => {
  const localnet = algorandFixture()
  beforeEach(localnet.newScope, 10_000)

  /** Compile ReplayProtectedSig with a random lease (unique escrow per call) */
  async function setupEscrow(
    algorand: ReturnType<typeof algorandFixture>['algorand'],
    overrides: Partial<TealTemplateParams> = {},
  ) {
    const leaseBytes = new Uint8Array(randomBytes(32))
    const teal = await readFile(join(ARTIFACTS, 'ReplayProtectedSig.teal'), 'utf-8')
    const compiled = await algorand.app.compileTealTemplate(teal, {
      TMPL_LEASE: leaseBytes,
      TMPL_EXPIRATION_ROUND: 50_000_000,
      ...overrides,
    })
    const escrow = algorand.account.logicsig(compiled.compiledBase64ToBytes)
    
    return { escrow, leaseBytes }
  }

  test('valid payment succeeds', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    const { escrow, leaseBytes } = await setupEscrow(algorand)

    // Fund the escrow
    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (2).algo(),
    })

    // Send payment within limits
    await algorand.send.payment({
      sender: escrow.addr,
      receiver: receiver.addr,
      amount: (500_000).microAlgo(),
      staticFee: (1_000).microAlgo(),
      lease: leaseBytes,
    })

    const escrowBalance = (await algorand.account.getInformation(escrow.addr)).balance
    expect(escrowBalance.microAlgo).toBe(2_000_000n - 500_000n - 1_000n)
  })

  test('lease prevents replay within same window', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    const { escrow, leaseBytes } = await setupEscrow(algorand)

    // Fund the escrow
    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (2).algo(),
    })

    // First payment succeeds
    await algorand.send.payment({
      sender: escrow.addr,
      receiver: receiver.addr,
      amount: (100_000).microAlgo(),
      staticFee: (1_000).microAlgo(),
      lease: leaseBytes,
    })

    // Same lease within overlapping validity window → rejected by Algorand's lease dedup
    await expect(
      algorand.send.payment({
        sender: escrow.addr,
        receiver: receiver.addr,
        amount: (100_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
        lease: leaseBytes,
      }),
    ).rejects.toThrow()
  })

  test('LogicSig expires after rounds advance', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    // Get current round
    const status = await algorand.client.algod.status().do()
    const currentRound = Number(status['lastRound'])
    const expirationRound = currentRound + 10

    // Compile with a near-future expiration
    const { escrow, leaseBytes } = await setupEscrow(algorand, {
      TMPL_EXPIRATION_ROUND: expirationRound,
    })

    // Fund the escrow
    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (2).algo(),
    })

    // First payment succeeds (lastValid set to expiration round)
    await algorand.send.payment({
      sender: escrow.addr,
      receiver: receiver.addr,
      amount: (100_000).microAlgo(),
      staticFee: (1_000).microAlgo(),
      lastValidRound: BigInt(expirationRound),
      lease: leaseBytes,
    })

    // Advance rounds past expiration by sending dummy transactions
    for (let i = 0; i < 15; i++) {
      await algorand.send.payment({
        sender: testAccount,
        receiver: testAccount,
        amount: (0).algo(),
      })
    }

    // Now currentRound > expirationRound.
    // The LogicSig requires lastValid <= expirationRound,
    // but the network requires lastValid > currentRound.
    // These constraints are mutually exclusive → the LogicSig is effectively expired.
    await expect(
      algorand.send.payment({
        sender: escrow.addr,
        receiver: receiver.addr,
        amount: (100_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
        lease: leaseBytes,
      }),
    ).rejects.toThrow()
  })

  test('rejects excessive amount', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    const { escrow, leaseBytes } = await setupEscrow(algorand)

    // Fund the escrow
    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (2).algo(),
    })

    // Amount > 1_000_000 → rejected by LogicSig
    await expect(
      algorand.send.payment({
        sender: escrow.addr,
        receiver: receiver.addr,
        amount: (1_500_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
        lease: leaseBytes,
      }),
    ).rejects.toThrow()
  })
})
