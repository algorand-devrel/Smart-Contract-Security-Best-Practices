import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SafeClearContractFactory } from '../artifacts/8-state-management/SafeClearContractClient'

describe('SafeClearContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(SafeClearContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })
    return { client: appClient, factory }
  }

  test('deploys successfully', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)
    expect(client.appId).toBeGreaterThan(0n)
  })

  test('opt-in initializes user balance to zero', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    await client.send.optIn.optInToApplication({ args: [] })

    const balance = await client.state.local(testAccount).userBalance()
    expect(balance).toBe(0n)
  })

  test('clear state tracks unclaimed funds in global state', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    await client.send.optIn.optInToApplication({ args: [] })

    // Clear state — the clear state program tracks the orphaned balance in global state
    // User balance was 0, so unclaimed funds remains 0
    await client.send.clearState()

    // The unclaimed funds global state should exist after clear state program ran
    const unclaimedAfter = await client.state.global.unclaimedFunds()
    expect(unclaimedAfter).toBe(0n)
  })
})
