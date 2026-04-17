import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SafeLifecycleContractFactory } from '../artifacts/8-state-management/SafeLifecycleContractClient'
import { VulnerableLifecycleContractFactory } from '../artifacts/8-state-management/VulnerableLifecycleContractClient'

describe('Finite State Machine Safety', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  test('VULN: overlapping flags allow incompatible states at the same time', async () => {
    const { testAccount } = localnet.context
    const factory = new VulnerableLifecycleContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await appClient.send.openSale({ args: {} })
    await appClient.send.openSettlement({ args: {} })

    await appClient.send.buy({ args: { amount: 1 } })
    await appClient.send.settle({ args: {} })
  })

  test('SAFE: methods are restricted to explicit mutually exclusive states', async () => {
    const { testAccount } = localnet.context
    const factory = new SafeLifecycleContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await expect(
      appClient.send.buy({ args: { amount: 1 } }),
    ).rejects.toThrow('Wrong state')

    await appClient.send.openTrading({ args: {} })
    await appClient.send.buy({ args: { amount: 1 } })
    await appClient.send.openSettlement({ args: {} })

    await expect(
      appClient.send.buy({ args: { amount: 1 } }),
    ).rejects.toThrow('Wrong state')

    await appClient.send.settle({ args: {} })
  })
})
