import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { SafeClearContractFactory } from '../artifacts/state_management/SafeClearContractClient'

export async function deploy() {
  console.log('=== Deploying SafeClearContract ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(SafeClearContractFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({
    createParams: { method: 'createApplication', args: {} },
    onUpdate: 'append',
    onSchemaBreak: 'append',
  })

  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: (1).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
  }

  console.log(`Deployed ${appClient.appClient.appName} (${appClient.appClient.appId})`)
}
