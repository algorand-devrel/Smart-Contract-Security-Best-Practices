import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { FeeExplicitZeroFactory } from '../artifacts/fee_verification_test/FeeExplicitZeroClient'
import { FeeOmittedFactory } from '../artifacts/fee_verification_test/FeeOmittedClient'

describe('Fee verification: explicit zero vs omitted', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  test('both contracts produce identical TEAL and behave the same', async () => {
    const { testAccount } = localnet.context

    // Deploy both contracts
    const explicitFactory = localnet.algorand.client.getTypedAppFactory(FeeExplicitZeroFactory, {
      defaultSender: testAccount,
    })
    const omittedFactory = localnet.algorand.client.getTypedAppFactory(FeeOmittedFactory, {
      defaultSender: testAccount,
    })

    const { appClient: explicitClient } = await explicitFactory.deploy({
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })
    const { appClient: omittedClient } = await omittedFactory.deploy({
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })

    // Fund both app accounts with 1 ALGO so they can send inner payments
    await localnet.algorand.send.payment({
      sender: testAccount,
      receiver: explicitClient.appAddress,
      amount: (1).algo(),
    })
    await localnet.algorand.send.payment({
      sender: testAccount,
      receiver: omittedClient.appAddress,
      amount: (1).algo(),
    })

    // Get balances before calling ping
    const explicitBalanceBefore = (await localnet.algorand.account.getInformation(explicitClient.appAddress)).balance
    const omittedBalanceBefore = (await localnet.algorand.account.getInformation(omittedClient.appAddress)).balance

    // Call ping(0) on both — inner payment of 0 ALGO
    // Extra fee of 1000 covers the inner txn via fee pooling
    await explicitClient.send.ping({
      args: { amount: 0n },
      extraFee: (1000).microAlgo(),
    })
    await omittedClient.send.ping({
      args: { amount: 0n },
      extraFee: (1000).microAlgo(),
    })

    // Get balances after
    const explicitBalanceAfter = (await localnet.algorand.account.getInformation(explicitClient.appAddress)).balance
    const omittedBalanceAfter = (await localnet.algorand.account.getInformation(omittedClient.appAddress)).balance

    // Both app accounts should have the same balance as before (fee=0 means app doesn't pay)
    expect(explicitBalanceAfter.microAlgo).toBe(explicitBalanceBefore.microAlgo)
    expect(omittedBalanceAfter.microAlgo).toBe(omittedBalanceBefore.microAlgo)

    // And both balances should be equal to each other
    expect(explicitBalanceAfter.microAlgo).toBe(omittedBalanceAfter.microAlgo)
  })
})
