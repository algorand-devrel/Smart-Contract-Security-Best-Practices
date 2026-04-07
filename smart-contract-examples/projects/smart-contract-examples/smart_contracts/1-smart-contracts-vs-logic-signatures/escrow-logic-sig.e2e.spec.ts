import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { TealTemplateParams } from '@algorandfoundation/algokit-utils/types/app'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const ARTIFACTS = join(__dirname, '..', 'artifacts', '1-smart-contracts-vs-logic-signatures')

/** Read a TEAL file, substitute template vars, compile, and return a LogicSigAccount */
async function compileLogicSig(
  algorand: ReturnType<typeof algorandFixture>['algorand'],
  tealFile: string,
  templateParams: TealTemplateParams,
) {
  const teal = await readFile(join(ARTIFACTS, tealFile), 'utf-8')
  const compiled = await algorand.app.compileTealTemplate(teal, templateParams)
  return algorand.account.logicsig(compiled.compiledBase64ToBytes)
}

describe('Escrow Logic Signature — e2e on localnet', () => {
  const localnet = algorandFixture()
  beforeEach(localnet.newScope, 10_000)

  /** Compile EscrowSig with standard template params */
  async function setupEscrow(
    algorand: AlgorandClient,
    recipientAddr: { publicKey: Uint8Array },
    overrides: Partial<TealTemplateParams> = {},
  ) {
    return compileLogicSig(algorand, 'EscrowSig.teal', {
      TMPL_RECIPIENT: recipientAddr.publicKey,
      TMPL_MAX_AMOUNT: 500_000,
      TMPL_LEASE: new TextEncoder().encode('aaaabbbbccccddddeeeeffffgggghhhh'),
      TMPL_EXPIRATION_ROUND: 50_000_000,
      ...overrides,
    })
  }

  test('valid withdrawal succeeds', async () => {
    const { testAccount, algorand } = localnet.context
    const recipient = algorand.account.random()

    const escrow = await setupEscrow(algorand, recipient.addr)

    // Fund the escrow
    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (1).algo(),
    })

    // Withdraw within limits
    await algorand.send.payment({
      sender: escrow.addr,
      receiver: recipient.addr,
      amount: (500_000).microAlgo(),
      staticFee: (1_000).microAlgo(),
      lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
    })

    const escrowBalance = (await algorand.account.getInformation(escrow.addr)).balance
    expect(escrowBalance.microAlgo).toBe(1_000_000n - 500_000n - 1_000n)
  })

  test('rejects wrong recipient', async () => {
    const { testAccount, algorand } = localnet.context
    const recipient = algorand.account.random()
    const wrongRecipient = algorand.account.random()

    const escrow = await setupEscrow(algorand, recipient.addr)

    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (1).algo(),
    })

    await expect(
      algorand.send.payment({
        sender: escrow.addr,
        receiver: wrongRecipient.addr,
        amount: (100_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
        lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
      }),
    ).rejects.toThrow()
  })

  test('rejects amount over limit', async () => {
    const { testAccount, algorand } = localnet.context
    const recipient = algorand.account.random()

    const escrow = await setupEscrow(algorand, recipient.addr)

    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (1).algo(),
    })

    // MAX_AMOUNT is 500_000 — try to withdraw more
    await expect(
      algorand.send.payment({
        sender: escrow.addr,
        receiver: recipient.addr,
        amount: (600_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
        lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
      }),
    ).rejects.toThrow()
  })

  test('rejects payment past expiration round', async () => {
    const { testAccount, algorand } = localnet.context
    const recipient = algorand.account.random()

    // Compile with an expiration round of 1 — already passed
    const escrow = await setupEscrow(algorand, recipient.addr, {
      TMPL_EXPIRATION_ROUND: 1,
    })

    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (1).algo(),
    })

    // The SDK sets lastValid to ~currentRound + 1000, which is > 1, so the lsig rejects
    await expect(
      algorand.send.payment({
        sender: escrow.addr,
        receiver: recipient.addr,
        amount: (100_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
        lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
      }),
    ).rejects.toThrow()
  })
})
