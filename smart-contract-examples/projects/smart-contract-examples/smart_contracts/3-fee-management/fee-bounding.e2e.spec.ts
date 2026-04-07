import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { TealTemplateParams } from '@algorandfoundation/algokit-utils/types/app'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const ARTIFACTS = join(__dirname, '..', 'artifacts', '3-fee-management')

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

describe('Fee Bounding — e2e on localnet', () => {
  const localnet = algorandFixture()
  beforeEach(localnet.newScope, 10_000)

  test('UnboundedFeeSig: excessive fee drains the escrow (VULN)', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    // Compile with the receiver's address baked in
    const lsigAccount = await compileLogicSig(algorand, 'UnboundedFeeSig.teal', {
      TMPL_INTENDED_RECEIVER: receiver.addr.publicKey,
      TMPL_LEASE: new TextEncoder().encode('aaaabbbbccccddddeeeeffffgggghhhh'),
    })

    // Fund the escrow with 1 ALGO
    await algorand.send.payment({
      sender: testAccount,
      receiver: lsigAccount.addr,
      amount: (1).algo(),
    })

    const balanceBefore = (await algorand.account.getInformation(lsigAccount.addr)).balance

    // Send a 0-amount payment with an excessive fee (0.1 ALGO = 100_000 microALGO)
    await algorand.send.payment({
      sender: lsigAccount.addr,
      receiver: receiver.addr,
      amount: (0).algo(),
      staticFee: (100_000).microAlgo(),
      lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
    })

    const balanceAfter = (await algorand.account.getInformation(lsigAccount.addr)).balance

    // The escrow lost 100_000 microALGO to fees (not to the receiver) — this is the vulnerability
    const drained = balanceBefore.microAlgo - balanceAfter.microAlgo
    expect(drained).toBe(100_000n)
  })

  test('BoundedFeeSig: excessive fee is rejected', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    const lsigAccount = await compileLogicSig(algorand, 'BoundedFeeSig.teal', {
      TMPL_INTENDED_RECEIVER: receiver.addr.publicKey,
      TMPL_LEASE: new TextEncoder().encode('aaaabbbbccccddddeeeeffffgggghhhh'),
    })

    // Fund the escrow
    await algorand.send.payment({
      sender: testAccount,
      receiver: lsigAccount.addr,
      amount: (1).algo(),
    })

    // Attempting an excessive fee should be rejected by the LogicSig
    await expect(
      algorand.send.payment({
        sender: lsigAccount.addr,
        receiver: receiver.addr,
        amount: (0).algo(),
        staticFee: (100_000).microAlgo(),
        lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
      }),
    ).rejects.toThrow()
  })

  test('BoundedFeeSig: normal fee payment succeeds', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    const lsigAccount = await compileLogicSig(algorand, 'BoundedFeeSig.teal', {
      TMPL_INTENDED_RECEIVER: receiver.addr.publicKey,
      TMPL_LEASE: new TextEncoder().encode('aaaabbbbccccddddeeeeffffgggghhhh'),
    })

    // Fund the escrow
    await algorand.send.payment({
      sender: testAccount,
      receiver: lsigAccount.addr,
      amount: (1).algo(),
    })

    // Normal fee payment should succeed
    await algorand.send.payment({
      sender: lsigAccount.addr,
      receiver: receiver.addr,
      amount: (500_000).microAlgo(),
      staticFee: (1_000).microAlgo(),
      lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
    })

    const escrowBalance = (await algorand.account.getInformation(lsigAccount.addr)).balance
    // Started with 1 ALGO (1_000_000), sent 500_000, paid 1_000 fee
    expect(escrowBalance.microAlgo).toBe(1_000_000n - 500_000n - 1_000n)
  })
})
