import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'

describe('ASA Reconfiguration Pitfall', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ populateAppCallResources: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  test('omitting address fields in reconfig permanently clears them', async () => {
    const { testAccount } = localnet.context
    const algorand = localnet.algorand

    // Step 1: Create an ASA with ALL four control addresses set
    const createResult = await algorand.send.assetCreate({
      sender: testAccount,
      total: 1_000_000n,
      decimals: 0,
      assetName: 'Test Token',
      unitName: 'TST',
      manager: testAccount,
      reserve: testAccount,
      freeze: testAccount,
      clawback: testAccount,
    })

    const assetId = createResult.assetId

    // Verify all addresses are set after creation
    let assetInfo = await algorand.client.algod.getAssetByID(Number(assetId)).do()
    expect(assetInfo.params.manager).toBe(testAccount.addr.toString())
    expect(assetInfo.params.reserve).toBe(testAccount.addr.toString())
    expect(assetInfo.params.freeze).toBe(testAccount.addr.toString())
    expect(assetInfo.params.clawback).toBe(testAccount.addr.toString())

    // Reconfigure — only set manager, omit the rest
    await algorand.send.assetConfig({
      sender: testAccount,
      assetId: assetId,
      manager: testAccount,
      // reserve: OMITTED
      // freeze: OMITTED
      // clawback: OMITTED
    })

    // Verify the omitted addresses are now permanently cleared
    assetInfo = await algorand.client.algod.getAssetByID(Number(assetId)).do()

    expect(assetInfo.params.manager).toBe(testAccount.addr.toString())
    expect(assetInfo.params.reserve).toBeUndefined()
    expect(assetInfo.params.freeze).toBeUndefined()
    expect(assetInfo.params.clawback).toBeUndefined()

    // Prove it's irreversible — the protocol accepts the transaction but silently ignores zeroed fields
    await algorand.send.assetConfig({
      sender: testAccount,
      assetId: assetId,
      manager: testAccount,
      reserve: testAccount,
      freeze: testAccount,
      clawback: testAccount,
    })

    // Addresses are STILL cleared — the "restore" had no effect
    assetInfo = await algorand.client.algod.getAssetByID(Number(assetId)).do()
    expect(assetInfo.params.reserve).toBeUndefined()
    expect(assetInfo.params.freeze).toBeUndefined()
    expect(assetInfo.params.clawback).toBeUndefined()
  })

  test('re-specifying all addresses in reconfig preserves them', async () => {
    const { testAccount } = localnet.context
    const algorand = localnet.algorand

    // Create an ASA with all four control addresses
    const createResult = await algorand.send.assetCreate({
      sender: testAccount,
      total: 1_000_000n,
      decimals: 0,
      assetName: 'Safe Token',
      unitName: 'SAFE',
      manager: testAccount,
      reserve: testAccount,
      freeze: testAccount,
      clawback: testAccount,
    })

    const assetId = createResult.assetId

    // SAFE: Re-specify ALL addresses during reconfiguration
    const newManager = algorand.account.random()
    await algorand.send.assetConfig({
      sender: testAccount,
      assetId: assetId,
      manager: newManager.addr,
      reserve: testAccount,
      freeze: testAccount,
      clawback: testAccount,
    })

    // Verify all addresses are preserved (manager changed, others kept)
    const assetInfo = await algorand.client.algod.getAssetByID(Number(assetId)).do()
    expect(assetInfo.params.manager).toBe(newManager.addr.toString())
    expect(assetInfo.params.reserve).toBe(testAccount.addr.toString())
    expect(assetInfo.params.freeze).toBe(testAccount.addr.toString())
    expect(assetInfo.params.clawback).toBe(testAccount.addr.toString())
  })
})
