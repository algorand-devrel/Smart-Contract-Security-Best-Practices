import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { RoleBasedContractFactory } from '../artifacts/2-access-control/RoleBasedContractClient'

describe('RoleBasedContract', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const operatorRole = new TextEncoder().encode('operator')

  /** Deploy RoleBasedContract with ABI create and fund for box MBR */
  const deploy = async () => {
    const { testAccount } = localnet.context
    const factory = localnet.algorand.client.getTypedAppFactory(RoleBasedContractFactory, {
      defaultSender: testAccount,
    })
    const { appClient } = await factory.deploy({
      createParams: { method: 'createApplication' as const, args: [] },
    })
    await localnet.algorand.send.payment({
      amount: (1).algo(),
      sender: testAccount,
      receiver: appClient.appAddress,
    })
    return appClient
  }

  /** Create a funded non-admin account */
  const fundUser = async () => {
    const { testAccount } = localnet.context
    const user = localnet.algorand.account.random()
    await localnet.algorand.send.payment({
      amount: (1).algo(),
      sender: testAccount,
      receiver: user.addr,
    })
    return user
  }

  test('creator has implicit admin role', async () => {
    const client = await deploy()
    const user = await fundUser()

    // Creator can grant roles without being explicitly assigned — proves implicit admin
    await client.send.grantRole({ args: { role: operatorRole, account: user.addr.toString() } })
  })

  test('admin can revoke role', async () => {
    const client = await deploy()
    const user = await fundUser()

    await client.send.grantRole({ args: { role: operatorRole, account: user.addr.toString() } })
    await client.send.revokeRole({ args: { role: operatorRole, account: user.addr.toString() } })
  })

  test('non-admin cannot grant role', async () => {
    const client = await deploy()
    const user = await fundUser()

    await expect(
      client.send.grantRole({ args: { role: operatorRole, account: user.addr.toString() }, sender: user.addr }),
    ).rejects.toThrow('Missing required role')
  })

  test('granted operator can perform operation', async () => {
    const client = await deploy()
    const user = await fundUser()

    await client.send.grantRole({ args: { role: operatorRole, account: user.addr.toString() } })
    await client.send.performOperation({ args: {}, sender: user.addr })
  })

  test('non-operator cannot perform operation', async () => {
    const client = await deploy()
    const user = await fundUser()

    await expect(
      client.send.performOperation({ args: {}, sender: user.addr }),
    ).rejects.toThrow('Missing required role')
  })

  test('admin can update', async () => {
    const client = await deploy()

    await client.send.update.updateApplication({ args: {} })
  })

  test('non-admin cannot update', async () => {
    const client = await deploy()
    const user = await fundUser()

    await expect(
      client.send.update.updateApplication({ args: {}, sender: user.addr }),
    ).rejects.toThrow()
  })

  test('admin can delete', async () => {
    const client = await deploy()

    await client.send.delete.deleteApplication({ args: {} })
  })

  test('non-admin cannot delete', async () => {
    const client = await deploy()
    const user = await fundUser()

    await expect(
      client.send.delete.deleteApplication({ args: {}, sender: user.addr }),
    ).rejects.toThrow()
  })
})
