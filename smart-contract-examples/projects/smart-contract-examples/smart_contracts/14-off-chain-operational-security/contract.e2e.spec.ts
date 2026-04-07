import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { PausableContractFactory } from '../artifacts/pausable_contract/PausableContractClient'

describe('PausableContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  test('deposit works when not paused', async () => {
    const { testAccount } = localnet.context

    const factory = new PausableContractFactory({
      algorand: localnet.algorand,
      defaultSender: testAccount,
    })

    const { appClient: client } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
    })

    await client.send.deposit({ args: { amount: 1000 } })

    const result = await client.send.getTotalDeposits({ args: {} })
    expect(result.return).toBe(1000n)
  })

  test('deposit fails when paused', async () => {
    const { testAccount } = localnet.context

    const factory = new PausableContractFactory({
      algorand: localnet.algorand,
      defaultSender: testAccount,
    })

    const { appClient: client } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
    })

    await client.send.pause({ args: {} })

    await expect(client.send.deposit({ args: { amount: 1000 } })).rejects.toThrow('Contract is paused')
  })

  test('deposit works after unpause', async () => {
    const { testAccount } = localnet.context

    const factory = new PausableContractFactory({
      algorand: localnet.algorand,
      defaultSender: testAccount,
    })

    const { appClient: client } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
    })

    await client.send.pause({ args: {} })
    await client.send.unpause({ args: {} })

    await client.send.deposit({ args: { amount: 1000 } })

    const result = await client.send.getTotalDeposits({ args: {} })
    expect(result.return).toBe(1000n)
  })

  test('only creator can pause', async () => {
    const { testAccount } = localnet.context

    const factory = new PausableContractFactory({
      algorand: localnet.algorand,
      defaultSender: testAccount,
    })

    const { appClient: client } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
    })

    const attacker = await localnet.algorand.account.random()

    await localnet.algorand.send.payment({
      amount: (1).algo(),
      sender: testAccount,
      receiver: attacker.addr,
    })

    const attackerClient = factory.getAppClientById({
      appId: client.appId,
      defaultSender: attacker.addr,
    })

    await expect(attackerClient.send.pause({ args: {} })).rejects.toThrow()
  })
})
