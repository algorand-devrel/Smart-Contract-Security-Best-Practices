import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { RotatingAdminContractFactory } from '../artifacts/2-access-control/RotatingAdminContractClient'
import { SafeTreasuryContractFactory } from '../artifacts/2-access-control/SafeTreasuryContractClient'
import { VulnerableTreasuryContractFactory } from '../artifacts/2-access-control/VulnerableTreasuryContractClient'

describe('Method Authorization', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const fundAccount = async () => {
    const { testAccount } = localnet.context
    const account = localnet.algorand.account.random()
    await localnet.algorand.send.payment({
      amount: (1).algo(),
      sender: testAccount,
      receiver: account.addr,
    })
    return account
  }

  test('VULN: anyone can retarget treasury', async () => {
    const { testAccount } = localnet.context
    const attacker = await fundAccount()
    const factory = new VulnerableTreasuryContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await appClient.send.setTreasury({ args: { newTreasury: attacker.addr.toString() }, sender: attacker.addr })
  })

  test('SAFE: unauthorized caller cannot retarget treasury', async () => {
    const { testAccount } = localnet.context
    const attacker = await fundAccount()
    const factory = new SafeTreasuryContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await expect(
      appClient.send.setTreasury({ args: { newTreasury: attacker.addr.toString() }, sender: attacker.addr }),
    ).rejects.toThrow('Admin only')
  })

  test('SAFE: admin can rotate authorization policy', async () => {
    const { testAccount } = localnet.context
    const replacementAdmin = await fundAccount()
    const factory = new SafeTreasuryContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await appClient.send.rotateAdmin({ args: { newAdmin: replacementAdmin.addr.toString() } })
    await appClient.send.setTreasury({
      args: { newTreasury: replacementAdmin.addr.toString() },
      sender: replacementAdmin.addr,
    })
  })

  test('SAFE: only the pending admin can accept rotation', async () => {
    const { testAccount } = localnet.context
    const replacementAdmin = await fundAccount()
    const attacker = await fundAccount()
    const factory = new RotatingAdminContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
    const { appClient } = await factory.deploy({ createParams: { method: 'createApplication' as const, args: [] } })

    await appClient.send.proposeAdmin({ args: { newAdmin: replacementAdmin.addr.toString() } })

    await expect(
      appClient.send.acceptAdmin({ args: {}, sender: attacker.addr }),
    ).rejects.toThrow('Pending admin only')

    await appClient.send.acceptAdmin({ args: {}, sender: replacementAdmin.addr })

    await expect(
      appClient.send.cancelAdminRotation({ args: {} }),
    ).rejects.toThrow('Admin only')

    await appClient.send.cancelAdminRotation({ args: {}, sender: replacementAdmin.addr })
  })
})
