import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { TealTemplateParams } from '@algorandfoundation/algokit-utils/types/app'
import { encodeUint64 } from 'algosdk'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const ARTIFACTS = join(__dirname, '..', 'artifacts', '1-smart-contracts-vs-logic-signatures')

/** Read a TEAL file, substitute template vars, compile, and return a LogicSigAccount */
async function compileLogicSig(
  algorand: AlgorandClient,
  tealFile: string,
  templateParams?: TealTemplateParams,
  args?: Uint8Array[],
) {
  const teal = await readFile(join(ARTIFACTS, tealFile), 'utf-8')
  const compiled = await algorand.app.compileTealTemplate(teal, templateParams)
  return algorand.account.logicsig(compiled.compiledBase64ToBytes, args)
}

/** Compile a LogicSig, sign it with the delegator's secret key, and register it as the signer */
async function makeDelegatedLsig(
  algorand: AlgorandClient,
  delegatorSk: Uint8Array,
  tealFile: string,
  templateParams?: TealTemplateParams,
  args?: Uint8Array[],
) {
  const lsig = await compileLogicSig(algorand, tealFile, templateParams, args)
  lsig.account.sign(delegatorSk)
  algorand.account.setSignerFromAccount(lsig.account)
  return lsig
}

describe('Delegated Logic Signatures — e2e on localnet', () => {
  const localnet = algorandFixture()
  beforeEach(localnet.newScope, 10_000)
  const MAX_AMOUNT = encodeUint64(1_000_000)
  const ATTACKER_MAX_AMOUNT = encodeUint64(10_000_000)

  describe('UnsafePaymentSig — delegated mode (VULN)', () => {
    test('VULN: rekeyTo succeeds — attacker takes over delegator account', async () => {
      const { testAccount, algorand } = localnet.context
      const delegator = algorand.account.random()
      const attacker = algorand.account.random()

      // Fund the delegator
      await algorand.send.payment({
        sender: testAccount,
        receiver: delegator.addr,
        amount: (5).algo(),
      })

      // Create delegated lsig signed by the delegator
      await makeDelegatedLsig(algorand, delegator.account.sk, 'UnsafePaymentSig.teal', undefined, [MAX_AMOUNT])

      // UnsafePaymentSig doesn't check rekeyTo — attacker can take over the account
      await algorand.send.payment({
        sender: delegator.addr,
        receiver: attacker.addr,
        amount: (0).algo(),
        staticFee: (1_000).microAlgo(),
        rekeyTo: attacker.addr,
      })

      // Verify the delegator's auth-addr is now the attacker
      const info = await algorand.account.getInformation(delegator.addr)
      expect(info.authAddr?.toString()).toBe(attacker.addr.toString())
    })

    test('VULN: closeRemainderTo succeeds — drains delegator balance', async () => {
      const { testAccount, algorand } = localnet.context
      const delegator = algorand.account.random()
      const attacker = algorand.account.random()

      // Fund the delegator
      await algorand.send.payment({
        sender: testAccount,
        receiver: delegator.addr,
        amount: (5).algo(),
      })

      await makeDelegatedLsig(algorand, delegator.account.sk, 'UnsafePaymentSig.teal', undefined, [MAX_AMOUNT])

      // UnsafePaymentSig doesn't check closeRemainderTo — attacker drains all funds
      await algorand.send.payment({
        sender: delegator.addr,
        receiver: attacker.addr,
        amount: (0).algo(),
        staticFee: (1_000).microAlgo(),
        closeRemainderTo: attacker.addr,
      })

      // Delegator is drained
      const delegatorBalance = (await algorand.account.getInformation(delegator.addr)).balance
      expect(delegatorBalance.microAlgo).toBe(0n)

      // Attacker received the funds (5 ALGO minus fee)
      const attackerBalance = (await algorand.account.getInformation(attacker.addr)).balance
      expect(attackerBalance.microAlgo).toBe(5_000_000n - 1_000n)
    })

    test('VULN: attacker can supply a larger maxAmount arg and bypass the intended cap', async () => {
      const { testAccount, algorand } = localnet.context
      const delegator = algorand.account.random()
      const attacker = algorand.account.random()

      await algorand.send.payment({
        sender: testAccount,
        receiver: delegator.addr,
        amount: (5).algo(),
      })

      await makeDelegatedLsig(algorand, delegator.account.sk, 'UnsafePaymentSig.teal', undefined, [ATTACKER_MAX_AMOUNT])

      await algorand.send.payment({
        sender: delegator.addr,
        receiver: attacker.addr,
        amount: (2_000_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
      })

      const attackerBalance = (await algorand.account.getInformation(attacker.addr)).balance
      expect(attackerBalance.microAlgo).toBe(2_000_000n)
    })
  })

  describe('SafePaymentSig — delegated mode', () => {
    /** Get a validity window centered around the current round */
    async function getValidityWindow(algorand: AlgorandClient) {
      const status = await algorand.client.algod.status().do()
      const currentRound = Number(status['lastRound'])
      return { firstValid: currentRound, lastValid: currentRound + 1000 }
    }

    test('valid payment succeeds', async () => {
      const { testAccount, algorand } = localnet.context
      const delegator = algorand.account.random()
      const receiver = algorand.account.random()
      const { firstValid, lastValid } = await getValidityWindow(algorand)

      await algorand.send.payment({
        sender: testAccount,
        receiver: delegator.addr,
        amount: (5).algo(),
      })

      await makeDelegatedLsig(algorand, delegator.account.sk, 'SafePaymentSig.teal', {
        TMPL_INTENDED_RECEIVER: receiver.addr.publicKey,
        TMPL_LEASE: new TextEncoder().encode('aaaabbbbccccddddeeeeffffgggghhhh'),
        TMPL_FIRST_VALID: firstValid,
        TMPL_LAST_VALID: lastValid,
      })

      await algorand.send.payment({
        sender: delegator.addr,
        receiver: receiver.addr,
        amount: (500_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
        lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
        firstValidRound: BigInt(firstValid),
        lastValidRound: BigInt(lastValid),
      })

      const receiverBalance = (await algorand.account.getInformation(receiver.addr)).balance
      expect(receiverBalance.microAlgo).toBe(500_000n)
    })

    test('rejects rekeyTo', async () => {
      const { testAccount, algorand } = localnet.context
      const delegator = algorand.account.random()
      const receiver = algorand.account.random()
      const attacker = algorand.account.random()
      const { firstValid, lastValid } = await getValidityWindow(algorand)

      await algorand.send.payment({
        sender: testAccount,
        receiver: delegator.addr,
        amount: (5).algo(),
      })

      await makeDelegatedLsig(algorand, delegator.account.sk, 'SafePaymentSig.teal', {
        TMPL_INTENDED_RECEIVER: receiver.addr.publicKey,
        TMPL_LEASE: new TextEncoder().encode('aaaabbbbccccddddeeeeffffgggghhhh'),
        TMPL_FIRST_VALID: firstValid,
        TMPL_LAST_VALID: lastValid,
      })

      await expect(
        algorand.send.payment({
          sender: delegator.addr,
          receiver: receiver.addr,
          amount: (0).algo(),
          staticFee: (1_000).microAlgo(),
          lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
          firstValidRound: BigInt(firstValid),
          lastValidRound: BigInt(lastValid),
          rekeyTo: attacker.addr,
        }),
      ).rejects.toThrow()
    })

    test('rejects wrong receiver', async () => {
      const { testAccount, algorand } = localnet.context
      const delegator = algorand.account.random()
      const receiver = algorand.account.random()
      const wrongReceiver = algorand.account.random()
      const { firstValid, lastValid } = await getValidityWindow(algorand)

      await algorand.send.payment({
        sender: testAccount,
        receiver: delegator.addr,
        amount: (5).algo(),
      })

      await makeDelegatedLsig(algorand, delegator.account.sk, 'SafePaymentSig.teal', {
        TMPL_INTENDED_RECEIVER: receiver.addr.publicKey,
        TMPL_LEASE: new TextEncoder().encode('aaaabbbbccccddddeeeeffffgggghhhh'),
        TMPL_FIRST_VALID: firstValid,
        TMPL_LAST_VALID: lastValid,
      })

      await expect(
        algorand.send.payment({
          sender: delegator.addr,
          receiver: wrongReceiver.addr,
          amount: (500_000).microAlgo(),
          staticFee: (1_000).microAlgo(),
          lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
          firstValidRound: BigInt(firstValid),
          lastValidRound: BigInt(lastValid),
        }),
      ).rejects.toThrow()
    })

    test('rejects excessive fee', async () => {
      const { testAccount, algorand } = localnet.context
      const delegator = algorand.account.random()
      const receiver = algorand.account.random()
      const { firstValid, lastValid } = await getValidityWindow(algorand)

      await algorand.send.payment({
        sender: testAccount,
        receiver: delegator.addr,
        amount: (5).algo(),
      })

      await makeDelegatedLsig(algorand, delegator.account.sk, 'SafePaymentSig.teal', {
        TMPL_INTENDED_RECEIVER: receiver.addr.publicKey,
        TMPL_LEASE: new TextEncoder().encode('aaaabbbbccccddddeeeeffffgggghhhh'),
        TMPL_FIRST_VALID: firstValid,
        TMPL_LAST_VALID: lastValid,
      })

      await expect(
        algorand.send.payment({
          sender: delegator.addr,
          receiver: receiver.addr,
          amount: (500_000).microAlgo(),
          staticFee: (100_000).microAlgo(),
          lease: 'aaaabbbbccccddddeeeeffffgggghhhh',
          firstValidRound: BigInt(firstValid),
          lastValidRound: BigInt(lastValid),
        }),
      ).rejects.toThrow()
    })
  })
})
