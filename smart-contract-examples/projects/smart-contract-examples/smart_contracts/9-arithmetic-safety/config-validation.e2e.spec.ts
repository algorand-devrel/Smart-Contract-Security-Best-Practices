import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SafeRewardsConfigContractFactory } from '../artifacts/9-arithmetic-safety/SafeRewardsConfigContractClient'
import { VulnerableRewardsConfigContractFactory } from '../artifacts/9-arithmetic-safety/VulnerableRewardsConfigContractClient'

describe('Configuration-Time Numeric Validation', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  test('VULN: zero scale is stored and later causes divide-by-zero', async () => {
    const { testAccount } = localnet.context
    const factory = new VulnerableRewardsConfigContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await appClient.send.configure({ args: { maxEligibleDeposits: 1_000, rewardRate: 50, rewardScale: 0 } })

    await expect(
      appClient.send.calculatePayout({ args: { eligibleDeposits: 1_000 } }),
    ).rejects.toThrow()
  })

  test('VULN: overflow-prone configuration is stored and later panics', async () => {
    const { testAccount } = localnet.context
    const factory = new VulnerableRewardsConfigContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await appClient.send.configure({
      args: {
        maxEligibleDeposits: 18_446_744_073_709_551_615n,
        rewardRate: 2,
        rewardScale: 1,
      },
    })

    await expect(
      appClient.send.calculatePayout({ args: { eligibleDeposits: 18_446_744_073_709_551_615n } }),
    ).rejects.toThrow()
  })

  test('SAFE: configuration rejects a zero denominator', async () => {
    const { testAccount } = localnet.context
    const factory = new SafeRewardsConfigContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await expect(
      appClient.send.configure({ args: { maxEligibleDeposits: 1_000, rewardRate: 50, rewardScale: 0 } }),
    ).rejects.toThrow('Scale must be nonzero')
  })

  test('SAFE: configuration rejects overflow-prone parameters', async () => {
    const { testAccount } = localnet.context
    const factory = new SafeRewardsConfigContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await expect(
      appClient.send.configure({
        args: {
          maxEligibleDeposits: 18_446_744_073_709_551_615n,
          rewardRate: 2,
          rewardScale: 1,
        },
      }),
    ).rejects.toThrow('Configuration can overflow')
  })

  test('SAFE: bounded configuration supports safe runtime arithmetic', async () => {
    const { testAccount } = localnet.context
    const factory = new SafeRewardsConfigContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await appClient.send.configure({ args: { maxEligibleDeposits: 1_000_000, rewardRate: 50, rewardScale: 10_000 } })

    const result = await appClient.send.calculatePayout({ args: { eligibleDeposits: 1_000_000 } })
    expect(result.return).toBe(5_000n)
  })
})
