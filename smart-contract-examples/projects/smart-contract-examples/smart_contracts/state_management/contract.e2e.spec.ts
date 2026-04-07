import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address, OnApplicationComplete } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SafeClearContractFactory } from '../artifacts/state_management/SafeClearContractClient'
import { PullPatternContractFactory } from '../artifacts/state_management/PullPatternContractClient'

describe('State Management', () => {
  const localnet = algorandFixture()
  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })
  beforeEach(localnet.newScope)

  const deploySafeClear = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(SafeClearContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })
    return { client: appClient, factory }
  }

  const deployPullPattern = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(PullPatternContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy({
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })
    return { client: appClient, factory }
  }

  describe('SafeClearContract', () => {
    test('can opt in and set balance', async () => {
      const { testAccount } = localnet.context
      const { client } = await deploySafeClear(testAccount)

      await client.send.optIn.optInToApplication({ args: {} })
      await client.send.setBalance({ args: { amount: 1000 } })
      const result = await client.send.getBalance({ args: {} })
      expect(result.return).toBe(1000n)
    })

    test('clear state tracks forfeited funds', async () => {
      const { testAccount } = localnet.context
      const { client } = await deploySafeClear(testAccount)

      await client.send.optIn.optInToApplication({ args: {} })
      await client.send.setBalance({ args: { amount: 5000 } })

      await localnet.algorand.send.appCall({
        sender: testAccount,
        appId: client.appId,
        onComplete: OnApplicationComplete.ClearStateOC,
      })

      const result = await client.send.getForfeited({ args: {} })
      expect(result.return).toBe(5000n)
    })
  })

  describe('PullPatternContract', () => {
    test('admin can queue withdrawal, user can withdraw', async () => {
      const { testAccount } = localnet.context
      const { client, factory } = await deployPullPattern(testAccount)

      // Fund app with 10 ALGO + 1 ALGO for box MBR
      await localnet.algorand.send.payment({ amount: (5).algo(), sender: testAccount, receiver: client.appAddress })
      await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: client.appAddress })

      // Create and fund user
      const user = localnet.algorand.account.random()
      await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: user.addr })

      // Admin queues withdrawal for user
      await client.send.queueWithdrawal({ args: { recipient: user.addr.toString(), amount: 1_000_000 } })

      // Verify pending
      const pending = await client.send.hasPending({ args: { account: user.addr.toString() } })
      expect(pending.return).toBe(true)

      // User withdraws
      const userClient = factory.getAppClientById({
        appId: client.appId,
        defaultSender: user.addr,
      })
      await userClient.send.withdraw({ args: {}, extraFee: (1_000).microAlgo() })

      // Verify no longer pending
      const pendingAfter = await client.send.hasPending({ args: { account: user.addr.toString() } })
      expect(pendingAfter.return).toBe(false)
    })

    test('non-admin cannot queue withdrawal', async () => {
      const { testAccount } = localnet.context
      const { client, factory } = await deployPullPattern(testAccount)

      const attacker = localnet.algorand.account.random()
      await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: attacker.addr })

      const attackerClient = factory.getAppClientById({
        appId: client.appId,
        defaultSender: attacker.addr,
      })

      await expect(
        attackerClient.send.queueWithdrawal({ args: { recipient: attacker.addr.toString(), amount: 1_000_000 } }),
      ).rejects.toThrow(/Admin only/)
    })
  })
})
