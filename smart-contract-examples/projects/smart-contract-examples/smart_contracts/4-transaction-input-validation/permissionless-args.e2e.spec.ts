import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SafePermissionlessArgsContractFactory } from '../artifacts/4-transaction-input-validation/SafePermissionlessArgsContractClient'
import { UnsafePermissionlessArgsContractFactory } from '../artifacts/4-transaction-input-validation/UnsafePermissionlessArgsContractClient'

describe('Permissionless Argument Validation', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const shortCommitment = new Uint8Array(31).fill(7)
  const validCommitment = new Uint8Array(32).fill(7)

  test('VULN: malformed permissionless inputs are accepted', async () => {
    const { testAccount } = localnet.context
    const factory = new UnsafePermissionlessArgsContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await appClient.send.submitCommitment({ args: { commitment: shortCommitment } })
    await appClient.send.setSlippage({ args: { slippageBps: 50_000 } })
    await appClient.send.chooseMode({ args: { mode: 9 } })
  })

  test('SAFE: fixed-length arguments must match the expected size', async () => {
    const { testAccount } = localnet.context
    const factory = new SafePermissionlessArgsContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await expect(
      appClient.send.submitCommitment({ args: { commitment: shortCommitment } }),
    ).rejects.toThrow('Commitment must be 32 bytes')

    await appClient.send.submitCommitment({ args: { commitment: validCommitment } })
  })

  test('SAFE: bounded arguments must stay within range', async () => {
    const { testAccount } = localnet.context
    const factory = new SafePermissionlessArgsContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await expect(
      appClient.send.setSlippage({ args: { slippageBps: 50_000 } }),
    ).rejects.toThrow('Slippage out of range')

    await appClient.send.setSlippage({ args: { slippageBps: 100 } })
  })

  test('SAFE: enumerated arguments must be one of the allowed values', async () => {
    const { testAccount } = localnet.context
    const factory = new SafePermissionlessArgsContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await expect(
      appClient.send.chooseMode({ args: { mode: 9 } }),
    ).rejects.toThrow('Invalid mode')

    await appClient.send.chooseMode({ args: { mode: 0 } })
    await appClient.send.chooseMode({ args: { mode: 1 } })
  })
})
