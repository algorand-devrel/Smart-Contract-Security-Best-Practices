import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const ARTIFACTS = join(__dirname, '..', 'artifacts', '7-group-transaction-security')
const textEncoder = new TextEncoder()

function encodeLogicSigBytesArg(value: string): Uint8Array {
  const raw = textEncoder.encode(value)
  const encoded = new Uint8Array(2 + raw.length)
  encoded[0] = (raw.length >> 8) & 0xff
  encoded[1] = raw.length & 0xff
  encoded.set(raw, 2)
  return encoded
}

describe('UnsafeArgSig — unsigned arguments vulnerability (e2e)', () => {
  const localnet = algorandFixture()
  beforeEach(localnet.newScope, 10_000)

  /** Compile UnsafeArgSig with the given typed LogicSig args baked into the LogicSigAccount */
  async function setupEscrow(
    algorand: ReturnType<typeof algorandFixture>['algorand'],
    args: Uint8Array[] = [encodeLogicSigBytesArg('s3cret')],
  ) {
    const teal = await readFile(join(ARTIFACTS, 'UnsafeArgSig.teal'), 'utf-8')
    const compiled = await algorand.app.compileTealTemplate(teal, {})
    return algorand.account.logicsig(compiled.compiledBase64ToBytes, args)
  }

  test('payment with correct password succeeds', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    const escrow = await setupEscrow(algorand)

    // Fund the escrow
    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (2).algo(),
    })

    const balanceBefore = (await algorand.account.getInformation(escrow.addr)).balance

    // Payment with correct typed arg succeeds
    await algorand.send.payment({
      sender: escrow.addr,
      receiver: receiver.addr,
      amount: (500_000).microAlgo(),
      staticFee: (1_000).microAlgo(),
    })

    const balanceAfter = (await algorand.account.getInformation(escrow.addr)).balance
    expect(balanceBefore.microAlgo - balanceAfter.microAlgo).toBe(500_000n + 1_000n)
  })

  test('attacker can use the same password to drain the escrow (VULN)', async () => {
    const { testAccount, algorand } = localnet.context
    const attackerReceiver = algorand.account.random()

    // Victim sets up the escrow with the "secret" password
    const escrow = await setupEscrow(algorand)

    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (2).algo(),
    })

    // Attacker sees the password "s3cret" in the TEAL bytecode (or on-chain args)
    // and constructs their own LogicSigAccount with the same program + args.
    // The args are NOT signed, so the attacker's copy is equally valid.
    const attackerEscrow = await setupEscrow(algorand, [encodeLogicSigBytesArg('s3cret')])

    // Both escrow addresses are identical — same program + same args = same address
    expect(attackerEscrow.addr.toString()).toBe(escrow.addr.toString())

    // Attacker drains the escrow to their own receiver
    await algorand.send.payment({
      sender: attackerEscrow.addr,
      receiver: attackerReceiver.addr,
      amount: (1_000_000).microAlgo(),
      staticFee: (1_000).microAlgo(),
    })

    const attackerBalance = (await algorand.account.getInformation(attackerReceiver.addr)).balance
    expect(attackerBalance.microAlgo).toBe(1_000_000n)
  })

  test('wrong password is rejected', async () => {
    const { testAccount, algorand } = localnet.context
    const receiver = algorand.account.random()

    // Note: wrong args produce a DIFFERENT address (different LogicSigAccount)
    // but even if the escrow was funded, the LogicSig check would fail
    const escrow = await setupEscrow(algorand, [encodeLogicSigBytesArg('wrong')])

    await algorand.send.payment({
      sender: testAccount,
      receiver: escrow.addr,
      amount: (2).algo(),
    })

    await expect(
      algorand.send.payment({
        sender: escrow.addr,
        receiver: receiver.addr,
        amount: (500_000).microAlgo(),
        staticFee: (1_000).microAlgo(),
      }),
    ).rejects.toThrow()
  })
})
