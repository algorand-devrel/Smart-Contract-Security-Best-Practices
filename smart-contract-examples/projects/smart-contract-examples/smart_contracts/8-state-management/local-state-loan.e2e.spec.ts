import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { VulnerableLoanContractFactory } from '../artifacts/8-state-management/VulnerableLoanContractClient'

describe('VulnerableLoanContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(VulnerableLoanContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy()
    return { client: appClient, factory }
  }

  test('deploys successfully', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)
    expect(client.appId).toBeGreaterThan(0n)
  })

  test('opt-in initializes debt and collateral to zero', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    await client.send.optIn.optInToApplication({ args: [] })

    const debt = await client.state.local(testAccount).debt()
    const collateral = await client.state.local(testAccount).collateral()
    
    expect(debt).toBe(0n)
    expect(collateral).toBe(0n)
  })

  test('borrow increases debt', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    await client.send.optIn.optInToApplication({ args: [] })
    await client.send.borrow({ args: { amount: 500_000n } })

    const debt = await client.state.local(testAccount).debt()
    expect(debt).toBe(500_000n)
  })

  test('VULN: user clears local state to erase debt', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Opt in and borrow
    await client.send.optIn.optInToApplication({ args: [] })
    await client.send.borrow({ args: { amount: 1_000_000n } })

    // Verify debt exists
    const debtBefore = await client.state.local(testAccount).debt()
    expect(debtBefore).toBe(1_000_000n)

    // User sends ClearState — erases all local state
    await client.send.clearState()

    // Debt is gone — user escaped their obligation
    // Reading local state after clear throws because the state no longer exists
    await expect(client.state.local(testAccount).debt()).rejects.toThrow()
  })
})
