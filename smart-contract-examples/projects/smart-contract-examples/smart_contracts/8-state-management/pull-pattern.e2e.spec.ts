import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { PullPatternContractFactory } from '../artifacts/8-state-management/PullPatternContractClient'

describe('PullPatternContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true, populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(PullPatternContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy()
    return { client: appClient, factory }
  }

  test('deploys successfully', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)
    expect(client.appId).toBeGreaterThan(0n)
  })

  test('creator queues withdrawal and recipient withdraws', async () => {
    const { testAccount, algorand } = localnet.context
    const { client, factory } = await deploy(testAccount)

    const recipient = algorand.account.random()

    // Fund recipient so it exists on-chain
    await algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: recipient })

    // Fund app account for inner payment + box MBR
    await algorand.send.payment({ amount: (5).algo(), sender: testAccount, receiver: client.appAddress })

    // Creator queues a withdrawal for the recipient
    await client.send.queueWithdrawal({
      args: { recipient: recipient.addr.toString(), amount: 1_000_000n },
      extraFee: (1_000).microAlgo(),
    })

    // Recipient withdraws their funds
    const recipientClient = factory.getAppClientById({
      appId: client.appId,
      defaultSender: recipient,
    })

    const balanceBefore = (await algorand.account.getInformation(recipient)).balance.microAlgo

    await recipientClient.send.withdraw({
      args: [],
      extraFee: (1_000).microAlgo(),
    })

    const balanceAfter = (await algorand.account.getInformation(recipient)).balance.microAlgo
    // Balance should increase (minus fees)
    expect(balanceAfter).toBeGreaterThan(balanceBefore)
  })

  test('rejects withdrawal when none is pending', async () => {
    const { testAccount, algorand } = localnet.context
    const { client, factory } = await deploy(testAccount)

    const user = algorand.account.random()
    await algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: user })

    const userClient = factory.getAppClientById({
      appId: client.appId,
      defaultSender: user,
    })

    await expect(
      userClient.send.withdraw({ args: [] }),
    ).rejects.toThrow('No pending withdrawal')
  })

  test('rejects non-creator queueing withdrawal', async () => {
    const { testAccount, algorand } = localnet.context
    const { client, factory } = await deploy(testAccount)

    const attacker = algorand.account.random()
    await algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: attacker })

    const attackerClient = factory.getAppClientById({
      appId: client.appId,
      defaultSender: attacker,
    })

    await expect(
      attackerClient.send.queueWithdrawal({
        args: { recipient: attacker.addr.toString(), amount: 1_000_000n },
      }),
    ).rejects.toThrow()
  })
})
