import { packageScriptCommand } from '@pedyc/harness-core'

export const getVerificationCommand = (root, script) => packageScriptCommand(root, script)
