import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { VulnerableAssetContractFactory } from '../artifacts/4-transaction-input-validation/VulnerableAssetContractClient'
import { SecureDepositContractFactory } from '../artifacts/4-transaction-input-validation/SecureDepositContractClient'

describe('Transaction Input Validation', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  /** Create two ASAs: a "real" token and a worthless one */
  const createAssets = async () => {
    const { testAccount } = localnet.context
    const realAsset = await localnet.algorand.send.assetCreate({
      sender: testAccount,
      total: 1_000_000n,
      assetName: 'RealToken',
    })
    const fakeAsset = await localnet.algorand.send.assetCreate({
      sender: testAccount,
      total: 1_000_000n,
      assetName: 'FakeToken',
    })
    return { realAssetId: realAsset.assetId, fakeAssetId: fakeAsset.assetId }
  }

  describe('VulnerableAssetContract', () => {
    const deploy = async () => {
      const { testAccount } = localnet.context
      const factory = new VulnerableAssetContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
      const { appClient } = await factory.deploy()

      // Fund the app so it can execute inner transactions (opt-in)
      await localnet.algorand.send.payment({
        sender: testAccount,
        receiver: appClient.appAddress,
        amount: (200_000).microAlgo(),
      })

      return appClient
    }

    test('VULN: accepts any asset — attacker can substitute a worthless token', async () => {
      const { testAccount } = localnet.context
      const client = await deploy()
      const { fakeAssetId } = await createAssets()

      // Opt the app into the fake asset via inner transaction
      await client.send.optInToAsset({ args: { asset: fakeAssetId }, extraFee: (1_000).microAlgo() })

      // The vulnerable contract accepts any asset transfer without checking the asset ID
      const result = await localnet.algorand.newGroup()
        .addAssetTransfer({
          sender: testAccount,
          receiver: client.appAddress,
          assetId: fakeAssetId,
          amount: 1n,
        })
        .addAppCallMethodCall({
          sender: testAccount,
          appId: client.appId,
          method: client.appClient.getABIMethod('deposit')!,
        })
        .send()

      // The deposit succeeds even though we sent a worthless fake token
      expect(result).toBeDefined()
    })
  })

  describe('SecureDepositContract', () => {
    const deploy = async () => {
      const { testAccount } = localnet.context
      const factory = new SecureDepositContractFactory({ algorand: localnet.algorand, defaultSender: testAccount })
      const { appClient } = await factory.deploy()

      // Fund the app so it can execute inner transactions (opt-in to multiple assets)
      await localnet.algorand.send.payment({
        sender: testAccount,
        receiver: appClient.appAddress,
        amount: (400_000).microAlgo(),
      })

      return appClient
    }

    test('rejects wrong asset', async () => {
      const { testAccount } = localnet.context
      const client = await deploy()
      const { realAssetId, fakeAssetId } = await createAssets()

      // Configure the contract to accept the real asset
      await client.send.setAsset({ args: { asset: realAssetId } })

      // Opt the app into both assets
      await client.send.optInToAsset({ args: { asset: realAssetId }, extraFee: (1_000).microAlgo() })
      await client.send.optInToAsset({ args: { asset: fakeAssetId }, extraFee: (1_000).microAlgo() })

      // Sending the fake asset is rejected
      await expect(
        client.send.deposit({
          args: {
            payment: await localnet.algorand.createTransaction.assetTransfer({
              sender: testAccount,
              receiver: client.appAddress,
              assetId: fakeAssetId,
              amount: 1n,
            }),
          },
        }),
      ).rejects.toThrow('Wrong asset')
    })

    test('accepts correct asset', async () => {
      const { testAccount } = localnet.context
      const client = await deploy()
      const { realAssetId } = await createAssets()

      // Configure and opt in
      await client.send.setAsset({ args: { asset: realAssetId } })
      await client.send.optInToAsset({ args: { asset: realAssetId }, extraFee: (1_000).microAlgo() })

      // Sending the correct asset succeeds
      await client.send.deposit({
        args: {
          payment: await localnet.algorand.createTransaction.assetTransfer({
            sender: testAccount,
            receiver: client.appAddress,
            assetId: realAssetId,
            amount: 1n,
          }),
        },
      })
    })

    test('rejects non-creator setting asset', async () => {
      const { testAccount } = localnet.context
      const client = await deploy()
      const { realAssetId } = await createAssets()

      // Fund an attacker
      const attacker = localnet.algorand.account.random()
      await localnet.algorand.send.payment({
        amount: (1).algo(),
        sender: testAccount,
        receiver: attacker.addr,
      })

      await expect(
        client.send.setAsset({ args: { asset: realAssetId }, sender: attacker.addr }),
      ).rejects.toThrow('Only creator')
    })
  })
})
