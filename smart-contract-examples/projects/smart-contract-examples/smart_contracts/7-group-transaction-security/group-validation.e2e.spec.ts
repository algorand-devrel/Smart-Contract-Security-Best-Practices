import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { VulnerableGroupContractFactory } from '../artifacts/7-group-transaction-security/VulnerableGroupContractClient'
import { SecureGroupContractFactory } from '../artifacts/7-group-transaction-security/SecureGroupContractClient'

describe('VulnerableGroupContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(VulnerableGroupContractFactory, { defaultSender: account })
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
})

describe('SecureGroupContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(SecureGroupContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })
    return { client: appClient, factory }
  }

  test('accepts valid payment', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Fund app for inner transactions
    await localnet.algorand.send.payment({ amount: (5).algo(), sender: testAccount, receiver: client.appAddress })

    // Call buyCredit with a valid payment (1 ALGO)
    await expect(
      client.send.buyCredit({
        args: {
          payment: await localnet.algorand.createTransaction.payment({
            sender: testAccount,
            receiver: client.appAddress,
            amount: (1).algo(),
          }),
        },
        extraFee: (1_000).microAlgo(),
      }),
    ).resolves.toBeDefined()
  })

  test('rejects insufficient payment', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    // Fund app for inner transactions
    await localnet.algorand.send.payment({ amount: (5).algo(), sender: testAccount, receiver: client.appAddress })

    // Call buyCredit with insufficient payment (100 microAlgo)
    await expect(
      client.send.buyCredit({
        args: {
          payment: await localnet.algorand.createTransaction.payment({
            sender: testAccount,
            receiver: client.appAddress,
            amount: (100).microAlgo(),
          }),
        },
        extraFee: (1_000).microAlgo(),
      }),
    ).rejects.toThrow('Insufficient payment')
  })
})
