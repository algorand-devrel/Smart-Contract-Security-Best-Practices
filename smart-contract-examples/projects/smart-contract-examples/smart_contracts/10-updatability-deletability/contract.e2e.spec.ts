import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { UpgradeableContractFactory } from '../artifacts/upgradeable_contract/UpgradeableContractClient'

describe('Upgradeable Contract', () => {
  const localnet = algorandFixture()
  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })
  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(UpgradeableContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })
    return { client: appClient, factory }
  }

  test('initial state is not scheduled', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    const result = await client.send.isUpgradeScheduled({ args: {} })
    expect(result.return).toBe(0n)
  })

  test('admin can schedule upgrade', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    const programHash = new Uint8Array(32)
    await client.send.scheduleUpgrade({ args: { programHash } })

    const result = await client.send.isUpgradeScheduled({ args: {} })
    expect(result.return).toBe(1n)
  })

  test('non-admin cannot schedule upgrade', async () => {
    const { testAccount } = localnet.context
    const { client, factory } = await deploy(testAccount)

    const attacker = localnet.algorand.account.random()
    await localnet.algorand.send.payment({ amount: (1).algo(), sender: testAccount, receiver: attacker.addr })

    const attackerClient = factory.getAppClientById({
      appId: client.appId,
      defaultSender: attacker.addr,
    })

    const programHash = new Uint8Array(32)
    await expect(
      attackerClient.send.scheduleUpgrade({ args: { programHash } }),
    ).rejects.toThrow(/Admin only/)
  })

  test('update fails before timelock expires', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    const programHash = new Uint8Array(32)
    await client.send.scheduleUpgrade({ args: { programHash } })

    await expect(
      client.send.update.updateApplication({ args: {} }),
    ).rejects.toThrow(/Timelock not expired/)
  })

  test('admin can cancel upgrade', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    const programHash = new Uint8Array(32)
    await client.send.scheduleUpgrade({ args: { programHash } })
    await client.send.cancelUpgrade({ args: {} })

    const result = await client.send.isUpgradeScheduled({ args: {} })
    expect(result.return).toBe(0n)
  })

  test('update succeeds after timelock expires', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    const programHash = new Uint8Array(32)
    await client.send.scheduleUpgrade({ args: { programHash } })

    // Advance the block timestamp by 24 hours (86400 seconds) using the devmode API
    await localnet.algorand.client.algod.setBlockOffsetTimestamp(86400).do()

    // Send a dummy transaction to produce a block with the new timestamp
    await localnet.algorand.send.payment({ amount: (0).algo(), sender: testAccount, receiver: testAccount })

    await client.send.update.updateApplication({ args: {} })

    // Verify upgrade was applied (schedule cleared)
    const result = await client.send.isUpgradeScheduled({ args: {} })
    expect(result.return).toBe(0n)

    // Reset the timestamp offset
    await localnet.algorand.client.algod.setBlockOffsetTimestamp(0).do()
  })

  test('update fails without scheduled upgrade', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    await expect(
      client.send.update.updateApplication({ args: {} }),
    ).rejects.toThrow(/No upgrade scheduled/)
  })
})
