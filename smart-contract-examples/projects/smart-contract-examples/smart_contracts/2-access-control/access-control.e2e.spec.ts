import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { OnApplicationComplete } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SecureContractFactory } from '../artifacts/2-access-control/SecureContractClient'
import { VulnerableContractFactory } from '../artifacts/2-access-control/VulnerableContractClient'
import { SafeDeleteContractFactory } from '../artifacts/2-access-control/SafeDeleteContractClient'
import { SafeDefaultContractFactory } from '../artifacts/2-access-control/SafeDefaultContractClient'

describe('Access Control', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  /** Create a funded attacker account */
  const fundAttacker = async () => {
    const { testAccount } = localnet.context
    const attacker = localnet.algorand.account.random()
    await localnet.algorand.send.payment({
      amount: (1).algo(),
      sender: testAccount,
      receiver: attacker.addr,
    })
    return attacker
  }

  describe('VulnerableContract', () => {
    const deploy = async () => {
      const { testAccount } = localnet.context
      const factory = new VulnerableContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
      const { appClient } = await factory.deploy()
      return appClient
    }

    test('VULN: anyone can update', async () => {
      const client = await deploy()
      const attacker = await fundAttacker()

      // Attacker successfully updates the contract — no access control stops them
      await client.send.update.updateApplication({ args: {}, sender: attacker.addr })
    })

    test('VULN: anyone can delete', async () => {
      const client = await deploy()
      const attacker = await fundAttacker()

      // Attacker successfully deletes the contract — no access control stops them
      await client.send.delete.deleteApplication({ args: {}, sender: attacker.addr })
    })
  })

  describe('SecureContract', () => {
    const deploy = async () => {
      const { testAccount } = localnet.context
      const factory = new SecureContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
      const { appClient } = await factory.deploy()
      return appClient
    }

    test('rejects non-creator update', async () => {
      const client = await deploy()
      const attacker = await fundAttacker()

      await expect(
        client.send.update.updateApplication({ args: {}, sender: attacker.addr }),
      ).rejects.toThrow('Only creator')
    })

    test('rejects non-creator delete', async () => {
      const client = await deploy()
      const attacker = await fundAttacker()

      await expect(
        client.send.delete.deleteApplication({ args: {}, sender: attacker.addr }),
      ).rejects.toThrow('Only creator')
    })

    test('creator can update', async () => {
      const client = await deploy()

      await client.send.update.updateApplication({ args: {} })
    })

    test('creator can delete', async () => {
      const client = await deploy()

      await client.send.delete.deleteApplication({ args: {} })
    })
  })

  describe('SafeDeleteContract', () => {
    const deploy = async () => {
      const { testAccount } = localnet.context
      const factory = new SafeDeleteContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
      const { appClient } = await factory.deploy()
      // Fund app account with minBalance so acct_params_get succeeds
      await localnet.algorand.send.payment({
        amount: (100_000).microAlgo(),
        sender: testAccount,
        receiver: appClient.appAddress,
      })
      return appClient
    }

    test('rejects delete when funds remain', async () => {
      const { testAccount } = localnet.context
      const client = await deploy()

      // Add extra funds so balance > minBalance
      await localnet.algorand.send.payment({
        amount: (1).algo(),
        sender: testAccount,
        receiver: client.appAddress,
      })

      await expect(
        client.send.delete.deleteApplication({ args: {} }),
      ).rejects.toThrow('Drain funds')
    })

    test('allows delete when drained', async () => {
      const client = await deploy()

      // balance equals minBalance — deletion allowed
      await client.send.delete.deleteApplication({ args: {} })
    })

    test('rejects non-creator delete', async () => {
      const client = await deploy()
      const attacker = await fundAttacker()

      await expect(
        client.send.delete.deleteApplication({ args: {}, sender: attacker.addr }),
      ).rejects.toThrow('Only creator')
    })
  })

  describe('Safe default: no handlers defined', () => {
    const deploy = async () => {
      const { testAccount } = localnet.context
      const factory = new SafeDefaultContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
      const { appClient } = await factory.deploy()
      return appClient
    }

    test('bare delete is rejected — even from creator', async () => {
      const { testAccount } = localnet.context
      const client = await deploy()

      await expect(
        localnet.algorand.send.appCall({
          appId: client.appId,
          sender: testAccount,
          onComplete: OnApplicationComplete.DeleteApplicationOC,
        }),
      ).rejects.toThrow()
    })

    test('bare update is rejected — even from creator', async () => {
      const { testAccount } = localnet.context
      const client = await deploy()

      const approval = (await localnet.algorand.app.compileTeal('#pragma version 11\npushint 1')).compiledBase64ToBytes
      const clear = (await localnet.algorand.app.compileTeal('#pragma version 11\npushint 1')).compiledBase64ToBytes

      await expect(
        localnet.algorand.send.appUpdate({
          appId: client.appId,
          sender: testAccount,
          approvalProgram: approval,
          clearStateProgram: clear,
        }),
      ).rejects.toThrow()
    })
  })
})
