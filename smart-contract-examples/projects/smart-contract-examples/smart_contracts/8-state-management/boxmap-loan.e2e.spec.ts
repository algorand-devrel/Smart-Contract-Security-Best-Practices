import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SecureLoanContractFactory } from '../artifacts/8-state-management/SecureLoanContractClient'

describe('SecureLoanContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true, populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(SecureLoanContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy()
    return { client: appClient, factory }
  }

  test('deploys successfully', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)
    expect(client.appId).toBeGreaterThan(0n)
  })

  test('register and borrow stores debt in BoxMap', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Fund app for box MBR
    await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: client.appAddress })

    await client.send.register({ args: [] })
    await client.send.borrow({ args: { amount: 500_000n } })

    const debt = await client.state.box.debt.value(testAccount.addr.toString())
    expect(debt).toBe(500_000n)
  })

  test('user cannot clear box state — not opted in so clearState fails', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Fund app for box MBR
    await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: client.appAddress })

    await client.send.register({ args: [] })
    await client.send.borrow({ args: { amount: 1_000_000n } })

    // SecureLoanContract uses BoxMap, not LocalState — user is never opted in
    // ClearState fails because there's no local state to clear
    await expect(client.send.clearState()).rejects.toThrow()

    // Debt still exists in BoxMap — user has no way to erase it
    const debt = await client.state.box.debt.value(testAccount.addr.toString())
    expect(debt).toBe(1_000_000n)
  })
})
