import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { StorageRefundContractFactory } from '../artifacts/8-state-management/StorageRefundContractClient'

describe('StorageRefundContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true, populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(StorageRefundContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy()
    return { client: appClient }
  }

  test('refunds the exact MBR released by deleting storage', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    const key = new Uint8Array(32).fill(7)

    // Fund the app so it can hold storage and refund released MBR
    await localnet.algorand.send.payment({ amount: (2).algo(), sender: testAccount, receiver: client.appAddress })

    await client.send.storeEntry({ args: { key, value: 123n } })

    const appInfoBefore = await localnet.algorand.account.getInformation(client.appAddress)
    const balanceBefore = appInfoBefore.balance.microAlgo

    const result = await client.send.deleteEntry({
      args: { key },
      extraFee: (1_000).microAlgo(),
    })

    const released = result.return
    const appInfoAfter = await localnet.algorand.account.getInformation(client.appAddress)
    const balanceAfter = appInfoAfter.balance.microAlgo

    expect(released).toBeGreaterThan(0n)
    expect(balanceBefore - balanceAfter).toBe(released)

    await expect(
      client.send.deleteEntry({
        args: { key },
        extraFee: (1_000).microAlgo(),
      }),
    ).rejects.toThrow('Entry not found')
  })

  test('rejects duplicate entry creation', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    const key = new Uint8Array(32).fill(9)

    await localnet.algorand.send.payment({ amount: (2).algo(), sender: testAccount, receiver: client.appAddress })

    await client.send.storeEntry({ args: { key, value: 1n } })

    await expect(
      client.send.storeEntry({ args: { key, value: 2n } }),
    ).rejects.toThrow('Entry already exists')
  })
})
