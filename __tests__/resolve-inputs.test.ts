import { beforeEach, expect, test } from '@jest/globals'
import { buildActionInputs } from '../src/resolve-inputs'
import { Version } from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/serverless/functions/v1/function'
import { LogLevel_Level } from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/logging/v1/log_entry'

const INPUT_ENV_KEYS = [
    'INPUT_RUNTIME',
    'INPUT_ENTRYPOINT',
    'INPUT_MEMORY',
    'INPUT_INCLUDE',
    'INPUT_EXCLUDE',
    'INPUT_SOURCE-ROOT',
    'INPUT_EXECUTION-TIMEOUT',
    'INPUT_ENVIRONMENT',
    'INPUT_SERVICE-ACCOUNT',
    'INPUT_SERVICE-ACCOUNT-NAME',
    'INPUT_BUCKET',
    'INPUT_DESCRIPTION',
    'INPUT_SECRETS',
    'INPUT_NETWORK-ID',
    'INPUT_TAGS',
    'INPUT_LOGS-DISABLED',
    'INPUT_LOGS-GROUP-ID',
    'INPUT_LOG-LEVEL',
    'INPUT_ASYNC',
    'INPUT_ASYNC-SA-ID',
    'INPUT_ASYNC-SA-NAME',
    'INPUT_ASYNC-RETRIES-COUNT',
    'INPUT_ASYNC-SUCCESS-YMQ-ARN',
    'INPUT_ASYNC-SUCCESS-SA-ID',
    'INPUT_ASYNC-SUCCESS-SA-NAME',
    'INPUT_ASYNC-FAILURE-YMQ-ARN',
    'INPUT_ASYNC-FAILURE-SA-ID',
    'INPUT_ASYNC-FAILURE-SA-NAME',
    'INPUT_MOUNTS'
]

beforeEach(() => {
    for (const key of INPUT_ENV_KEYS) delete process.env[key]
})

const previousVersion: Version = Version.fromPartial({
    id: 'previous-version-id',
    functionId: 'functionid',
    runtime: 'python312',
    entrypoint: 'main.handler',
    resources: { memory: 268435456 }, // 256Mb
    executionTimeout: { seconds: 42 },
    serviceAccountId: 'inherited-sa-id',
    tags: ['production'],
    environment: { FOO: 'inherited' },
    connectivity: { networkId: 'inherited-network' },
    secrets: [{ id: 'secret-id', versionId: 'v1', key: 'key', environmentVariable: 'SECRET_ENV' }],
    logOptions: { disabled: true, logGroupId: 'inherited-log-group', minLevel: LogLevel_Level.WARN },
    mounts: [{ name: 'data', mode: 0, objectStorage: { bucketId: 'inherited-bucket', prefix: '' } }],
    asyncInvocationConfig: {
        retriesCount: 7,
        serviceAccountId: 'inherited-async-sa',
        successTarget: { ymqTarget: { queueArn: 'arn:success', serviceAccountId: 'inherited-success-sa' } },
        failureTarget: { ymqTarget: { queueArn: 'arn:failure', serviceAccountId: 'inherited-failure-sa' } }
    }
})

test('without a previous version, falls back to the hardcoded defaults', () => {
    process.env.INPUT_RUNTIME = 'nodejs20'
    process.env.INPUT_ENTRYPOINT = 'index.handler'

    const inputs = buildActionInputs('folderid', 'my-function', undefined)

    expect(inputs.memory).toBe(128 * 1024 * 1024)
    expect(inputs.executionTimeout).toBe(5)
    expect(inputs.logsDisabled).toBe(false)
    expect(inputs.async).toBe(false)
    expect(inputs.asyncRetriesCount).toBe(3)
    expect(inputs.environment).toEqual([])
    expect(inputs.tags).toEqual([])
})

test('throws when runtime/entrypoint are missing and there is nothing to inherit from', () => {
    expect(() => buildActionInputs('folderid', 'my-function', undefined)).toThrow(
        'Input required and not supplied: runtime'
    )
})

test('unspecified inheritable inputs are pulled from the previous version', () => {
    const inputs = buildActionInputs('folderid', 'my-function', previousVersion)

    expect(inputs.runtime).toBe('python312')
    expect(inputs.entrypoint).toBe('main.handler')
    expect(inputs.memory).toBe(268435456)
    expect(inputs.executionTimeout).toBe(42)
    expect(inputs.serviceAccount).toBe('inherited-sa-id')
    expect(inputs.environment).toEqual(['FOO=inherited'])
    expect(inputs.secrets).toEqual(['SECRET_ENV=secret-id/v1/key'])
    expect(inputs.networkId).toBe('inherited-network')
    expect(inputs.tags).toEqual(['production'])
    expect(inputs.logsDisabled).toBe(true)
    expect(inputs.logsGroupId).toBe('inherited-log-group')
    expect(inputs.logLevel).toBe(LogLevel_Level.WARN)
    expect(inputs.mounts).toEqual(['data:inherited-bucket'])
    expect(inputs.async).toBe(true)
    expect(inputs.asyncSaId).toBe('inherited-async-sa')
    expect(inputs.asyncRetriesCount).toBe(7)
    expect(inputs.asyncSuccessYmqArn).toBe('arn:success')
    expect(inputs.asyncSuccessSaId).toBe('inherited-success-sa')
    expect(inputs.asyncFailureYmqArn).toBe('arn:failure')
    expect(inputs.asyncFailureSaId).toBe('inherited-failure-sa')
})

test('an explicit input always wins over an inherited value', () => {
    process.env.INPUT_RUNTIME = 'nodejs20'
    process.env.INPUT_MEMORY = '512Mb'
    process.env['INPUT_EXECUTION-TIMEOUT'] = '10'
    process.env['INPUT_SERVICE-ACCOUNT'] = 'explicit-sa-id'
    process.env.INPUT_ASYNC = 'false'

    const inputs = buildActionInputs('folderid', 'my-function', previousVersion)

    expect(inputs.runtime).toBe('nodejs20')
    expect(inputs.memory).toBe(536870912)
    expect(inputs.executionTimeout).toBe(10)
    expect(inputs.serviceAccount).toBe('explicit-sa-id')
    // entrypoint still inherited, since it wasn't explicitly set
    expect(inputs.entrypoint).toBe('main.handler')
    // explicit `false` overrides the inherited async config presence
    expect(inputs.async).toBe(false)
})

test('an explicit service-account-name is not overridden by an inherited service account id', () => {
    process.env['INPUT_SERVICE-ACCOUNT-NAME'] = 'my-sa-name'

    const inputs = buildActionInputs('folderid', 'my-function', previousVersion)

    expect(inputs.serviceAccount).toBe('')
    expect(inputs.serviceAccountName).toBe('my-sa-name')
})
