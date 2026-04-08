import { AlgorandClient } from '@algorandfoundation/algokit-utils'
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

  /** Get a validity window centered around the current round */
  async function getValidityWindow(algorand: AlgorandClient) {
    const status = await algorand.client.algod.status().do()
    const currentRound = Number(status['lastRound'])
    return { firstValid: currentRound, lastValid: currentRound + 1000 }
  }

  /** Compile ReplayProtectedSig with a random lease (unique escrow per call) */
  async function setupEscrow(
    algorand: AlgorandClient,
    overrides: Partial<TealTemplateParams> = {},
  ) {
    const leaseBytes = new Uint8Array(randomBytes(32))
    const { firstValid, lastValid } = await getValidityWindow(algorand)
    const teal = await readFile(join(ARTIFACTS, 'ReplayProtectedSig.teal'), 'utf-8')
    const compiled = await algorand.app.compileTealTemplate(teal, {
      TMPL_LEASE: leaseBytes,
      TMPL_FIRST_VALID: firstValid,
      TMPL_LAST_VALID: lastValid,
      ...overrides,
    })
    const escrow = algorand.account.logicsig(compiled.compiledBase64ToBytes)

    return { escrow, leaseBytes, firstValid, lastValid }
  }

  test('valid payment succeeds', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    const { escrow, leaseBytes, firstValid, lastValid } = await setupEscrow(algorand)

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
      firstValidRound: BigInt(firstValid),
      lastValidRound: BigInt(lastValid),
    })

    const escrowBalance = (await algorand.account.getInformation(escrow.addr)).balance
    expect(escrowBalance.microAlgo).toBe(2_000_000n - 500_000n - 1_000n)
  })

  test('lease prevents replay within same window', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    const { escrow, leaseBytes, firstValid, lastValid } = await setupEscrow(algorand)

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
      firstValidRound: BigInt(firstValid),
      lastValidRound: BigInt(lastValid),
    })

    // Same lease within overlapping validity window → rejected by Algorand's lease dedup
    await expect(
      algorand.send.payment({
        sender: escrow.addr,
        receiver: receiver.addr,
        amount: (100_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
        lease: leaseBytes,
        firstValidRound: BigInt(firstValid),
        lastValidRound: BigInt(lastValid),
      }),
    ).rejects.toThrow()
  })

  test('LogicSig expires after rounds advance past validity window', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    // Get current round
    const status = await algorand.client.algod.status().do()
    const currentRound = Number(status['lastRound'])
    const firstValid = currentRound
    const lastValid = currentRound + 10

    // Compile with a near-future validity window
    const { escrow, leaseBytes } = await setupEscrow(algorand, {
      TMPL_FIRST_VALID: firstValid,
      TMPL_LAST_VALID: lastValid,
    })

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
      firstValidRound: BigInt(firstValid),
      lastValidRound: BigInt(lastValid),
      lease: leaseBytes,
    })

    // Advance rounds past the validity window by sending dummy transactions
    for (let i = 0; i < 15; i++) {
      await algorand.send.payment({
        sender: testAccount,
        receiver: testAccount,
        amount: (0).algo(),
      })
    }

    // Now currentRound > lastValid.
    // The LogicSig requires lastValid === LAST_VALID (which is in the past),
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

    const { escrow, leaseBytes, firstValid, lastValid } = await setupEscrow(algorand)

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
        firstValidRound: BigInt(firstValid),
        lastValidRound: BigInt(lastValid),
      }),
    ).rejects.toThrow()
  })
})
