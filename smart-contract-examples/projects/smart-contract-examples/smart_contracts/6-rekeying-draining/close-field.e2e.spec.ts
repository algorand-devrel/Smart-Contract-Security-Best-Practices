import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { CloseFieldContractFactory } from '../artifacts/6-rekeying-draining/CloseFieldContractClient'

describe('CloseFieldContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(CloseFieldContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
    return { client: appClient, factory }
  }

  test('unsafeTransfer with closeRemainderTo drains app to 0', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Fund the app with 5 ALGO
    await localnet.algorand.send.payment({ amount: (5).algo(), sender: testAccount, receiver: client.appAddress })

    // Verify app has funds
    const appInfoBefore = await localnet.algorand.account.getInformation(client.appAddress)
    expect(appInfoBefore.balance.microAlgo).toBeGreaterThan(0n)

    // Create an attacker who will receive the drained funds via closeRemainderTo
    const attacker = localnet.algorand.account.random()
    await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: attacker.addr })

    // Create a receiver for the nominal transfer
    const receiver = localnet.algorand.account.random()
    await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: receiver.addr })

    // Call unsafeTransfer which allows closeRemainderTo - this drains the app
    await client.send.unsafeTransfer({
      args: { receiver: receiver.addr.toString(), closeTo: attacker.addr.toString() },
      extraFee: (1_000).microAlgo(),
    })

    // App should be drained (balance at 0)
    const appInfoAfter = await localnet.algorand.account.getInformation(client.appAddress)
    expect(appInfoAfter.balance.microAlgo).toBe(0n)
  })

  test('safeTransfer sends exact amount, app retains balance', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Fund the app with 5 ALGO
    await localnet.algorand.send.payment({ amount: (5).algo(), sender: testAccount, receiver: client.appAddress })

    // Create a receiver
    const receiver = localnet.algorand.account.random()
    await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: receiver.addr })

    const receiverInfoBefore = await localnet.algorand.account.getInformation(receiver.addr)
    const receiverBalanceBefore = receiverInfoBefore.balance.microAlgo

    const transferAmount = 1_000_000 // 1 ALGO

    // Call safeTransfer which sends exact amount without closeRemainderTo
    await client.send.safeTransfer({
      args: { receiver: receiver.addr.toString(), amount: transferAmount },
      extraFee: (1_000).microAlgo(),
    })

    // Receiver should have received exactly 1 ALGO more
    const receiverInfoAfter = await localnet.algorand.account.getInformation(receiver.addr)
    expect(receiverInfoAfter.balance.microAlgo).toBe(receiverBalanceBefore + BigInt(transferAmount))

    // App should still have most of its balance
    const appInfoAfter = await localnet.algorand.account.getInformation(client.appAddress)
    expect(appInfoAfter.balance.microAlgo).toBeGreaterThan(0n)
  })
})
