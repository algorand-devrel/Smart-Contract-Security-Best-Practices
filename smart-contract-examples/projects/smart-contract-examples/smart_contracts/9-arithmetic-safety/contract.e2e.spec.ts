import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { ArithmeticContractFactory } from '../artifacts/9-arithmetic-safety/ArithmeticContractClient'

describe('Arithmetic Safety', () => {
  const localnet = algorandFixture()
  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })
  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(ArithmeticContractFactory, { defaultSender: account })
    const { appClient } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })
    return { client: appClient, factory }
  }

  test('safeAdd works for valid inputs', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    const result = await client.send.safeAdd({ args: { a: 100, b: 200 } })
    expect(result.return).toBe(300n)
  })

  test('unsafeAdd panics on overflow', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    await expect(
      client.send.unsafeAdd({ args: { a: 18_446_744_073_709_551_615n, b: 1 } }),
    ).rejects.toThrow()
  })

  test('safeAdd rejects overflow with clear error', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    await expect(
      client.send.safeAdd({ args: { a: 18_446_744_073_709_551_615n, b: 1 } }),
    ).rejects.toThrow(/Overflow/)
  })

  test('safeWithdraw rejects underflow', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    await client.send.setBalance({ args: { amount: 100 } })
    await expect(
      client.send.safeWithdraw({ args: { amount: 200 } }),
    ).rejects.toThrow(/Insufficient balance/)
  })

  test('unsafeWithdraw panics on underflow', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    await client.send.setBalance({ args: { amount: 100 } })
    await expect(
      client.send.unsafeWithdraw({ args: { amount: 200 } }),
    ).rejects.toThrow()
  })

  test('safeMultiplyDivide handles large values', async () => {
    const { testAccount } = localnet.context
    const { client } = await deploy(testAccount)

    const result = await client.send.safeMultiplyDivide({ args: { a: 1_000_000, b: 1_000_000, denominator: 1_000 } })
    expect(result.return).toBe(1_000_000_000n)
  })
})
