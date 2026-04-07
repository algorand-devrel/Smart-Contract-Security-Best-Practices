import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { VulnerableMinBalanceContractFactory } from '../artifacts/8-state-management/VulnerableMinBalanceContractClient'
import { SafeMinBalanceContractFactory } from '../artifacts/8-state-management/SafeMinBalanceContractClient'

describe('VulnerableMinBalanceContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true, populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(VulnerableMinBalanceContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy()
    return { client: appClient }
  }

  test('VULN: hard-coded check passes when contract has enough balance', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Fund the contract account
    await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: client.appAddress })

    // Withdraw a small amount — hard-coded 100_000 check passes
    await expect(
      client.send.withdraw({ args: { amount: 100_000n } }),
    ).resolves.toBeDefined()
  })
})

describe('SafeMinBalanceContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true, populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(SafeMinBalanceContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy()
    return { client: appClient }
  }

  test('dynamic check passes when contract has spendable balance', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Fund the contract account
    await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: client.appAddress })

    // Withdraw a small amount — dynamic minBalance check passes
    await expect(
      client.send.withdraw({ args: { amount: 100_000n } }),
    ).resolves.toBeDefined()
  })

  test('dynamic check rejects when amount exceeds spendable balance', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Fund the contract with a small amount
    await localnet.algorand.send.payment({ amount: (200_000).microAlgo(), sender: testAccount, receiver: client.appAddress })

    // Try to withdraw more than spendable balance (balance - minBalance)
    await expect(
      client.send.withdraw({ args: { amount: 200_000n } }),
    ).rejects.toThrow('Insufficient contract balance')
  })
})
