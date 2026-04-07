import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SafePaymentManagerFactory } from '../artifacts/1-smart-contracts-vs-logic-signatures/SafePaymentManagerClient'

describe('SafePaymentManager', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  test('creator can authorize payment', async () => {
    const { testAccount } = localnet.context

    const factory = new SafePaymentManagerFactory({
      algorand: localnet.algorand,
      defaultSender: testAccount,
    })

    const { appClient: client } = await factory.deploy()

    // Fund the app account so it can send inner payments
    await localnet.algorand.send.payment({
      amount: (5).algo(),
      sender: testAccount,
      receiver: client.appAddress,
    })

    const receiver = localnet.algorand.account.random()
    await localnet.algorand.send.payment({
      amount: (1).algo(),
      sender: testAccount,
      receiver: receiver.addr,
    })

    await client.send.authorizePayment({
      args: { receiver: receiver.addr.toString(), amount: 500_000 },
      extraFee: (1_000).microAlgo(),
    })
  })

  test('non-creator is rejected', async () => {
    const { testAccount } = localnet.context

    const factory = new SafePaymentManagerFactory({
      algorand: localnet.algorand,
      defaultSender: testAccount,
    })

    const { appClient: client } = await factory.deploy()

    const attacker = localnet.algorand.account.random()

    // Fund attacker so they can send transactions
    await localnet.algorand.send.payment({
      amount: (1).algo(),
      sender: testAccount,
      receiver: attacker.addr,
    })

    const attackerClient = factory.getAppClientById({
      appId: client.appId,
      defaultSender: attacker.addr,
    })

    const receiver = localnet.algorand.account.random()

    await expect(
      attackerClient.send.authorizePayment({
        args: { receiver: receiver.addr.toString(), amount: 500_000 },
        extraFee: (1_000).microAlgo(),
      }),
    ).rejects.toThrow('Only creator')
  })
})
