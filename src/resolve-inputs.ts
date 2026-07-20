/**
 * Reads GitHub Action inputs and resolves them into a complete {@link ActionInputs}.
 *
 * For every field marked "(inheritable)" in `action.yml`, an unspecified input falls back to
 * the matching field of `previousVersion` (when inherit-mode supplied one) before falling back
 * to this action's hardcoded default - see {@link ./inherit} for how the previous version is
 * converted into the same shapes these inputs come in.
 *
 * @module
 */

import { getInput, getMultilineInput } from '@actions/core'
import { Version } from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/serverless/functions/v1/function'
import { LogLevel_Level } from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/logging/v1/log_entry'
import { ActionInputs } from './action-inputs'
import { envMapToLines, inheritableTags, mountsToLines, secretsToLines } from './inherit'
import { MB, parseLogLevel, parseMemory } from './parse'

const DEFAULT_MEMORY = 128 * MB
const DEFAULT_EXECUTION_TIMEOUT = 5
const DEFAULT_ASYNC_RETRIES_COUNT = 3

const TRUE_VALUES = ['true', 'True', 'TRUE']
const FALSE_VALUES = ['false', 'False', 'FALSE']

/** Required field with no hardcoded default: explicit input, else inherited value, else throw. */
function resolveRequired(explicit: string, inherited: string | undefined, name: string): string {
    if (explicit !== '') return explicit
    if (inherited) return inherited
    throw new Error(`Input required and not supplied: ${name}`)
}

/** Optional string field: explicit input, else inherited value, else hardcoded default. */
function resolveString(explicit: string, inherited: string | undefined, hardDefault = ''): string {
    if (explicit !== '') return explicit
    return inherited || hardDefault
}

/**
 * Resolves an ID that can alternatively be specified by name (service accounts).
 * Inheritance only kicks in when *neither* the id nor the name input was given, so an explicit
 * name is never silently overridden by an inherited id.
 */
function resolveIdOrName(explicitId: string, explicitName: string, inheritedId: string | undefined): string {
    if (explicitId !== '' || explicitName !== '') return explicitId
    return inheritedId ?? ''
}

function resolveNumber(explicit: string, inherited: number | undefined, hardDefault: number): number {
    if (explicit !== '') return parseInt(explicit, 10)
    return inherited ?? hardDefault
}

/** Parses a boolean input the same way `getBooleanInput` does, returning `undefined` when unset. */
function parseOptionalBoolean(name: string): boolean | undefined {
    const raw = getInput(name)
    if (raw === '') return undefined
    if (TRUE_VALUES.includes(raw)) return true
    if (FALSE_VALUES.includes(raw)) return false
    throw new TypeError(
        `Input does not meet YAML 1.2 "Core Schema" specification: ${name}\n` +
            `Support boolean input list: \`true | True | TRUE | false | False | FALSE\``
    )
}

function resolveBoolean(name: string, inherited: boolean | undefined, hardDefault: boolean): boolean {
    return parseOptionalBoolean(name) ?? inherited ?? hardDefault
}

/** Multiline field: explicit lines, else lines derived from the previous version, else empty. */
function resolveLines(explicit: string[], inherited: string[] | undefined): string[] {
    return explicit.length > 0 ? explicit : (inherited ?? [])
}

/**
 * Builds the complete, resolved action configuration.
 *
 * @param folderId - Already-resolved `folder-id` input
 * @param functionName - Already-resolved `function-name` input
 * @param previousVersion - The function's `$latest` version to inherit from, or `undefined` if
 *   inherit-mode is off or there is no previous version yet
 */
export function buildActionInputs(
    folderId: string,
    functionName: string,
    previousVersion: Version | undefined
): ActionInputs {
    const serviceAccountInput = getInput('service-account')
    const serviceAccountNameInput = getInput('service-account-name')
    const asyncSaIdInput = getInput('async-sa-id')
    const asyncSaNameInput = getInput('async-sa-name')
    const asyncSuccessSaIdInput = getInput('async-success-sa-id')
    const asyncSuccessSaNameInput = getInput('async-success-sa-name')
    const asyncFailureSaIdInput = getInput('async-failure-sa-id')
    const asyncFailureSaNameInput = getInput('async-failure-sa-name')
    const logLevelInput = getInput('log-level', { trimWhitespace: true })

    const successTarget = previousVersion?.asyncInvocationConfig?.successTarget?.ymqTarget
    const failureTarget = previousVersion?.asyncInvocationConfig?.failureTarget?.ymqTarget

    return {
        folderId,
        functionName,
        runtime: resolveRequired(getInput('runtime'), previousVersion?.runtime, 'runtime'),
        entrypoint: resolveRequired(getInput('entrypoint'), previousVersion?.entrypoint, 'entrypoint'),
        memory: (() => {
            const explicit = getInput('memory')
            return explicit !== '' ? parseMemory(explicit) : (previousVersion?.resources?.memory ?? DEFAULT_MEMORY)
        })(),
        include: getMultilineInput('include', { required: false }),
        excludePattern: getMultilineInput('exclude', { required: false }),
        sourceRoot: getInput('source-root', { required: false }) || '.',
        executionTimeout: resolveNumber(
            getInput('execution-timeout'),
            previousVersion?.executionTimeout?.seconds,
            DEFAULT_EXECUTION_TIMEOUT
        ),
        environment: resolveLines(
            getMultilineInput('environment', { required: false }),
            previousVersion && envMapToLines(previousVersion.environment)
        ),
        serviceAccount: resolveIdOrName(
            serviceAccountInput,
            serviceAccountNameInput,
            previousVersion?.serviceAccountId
        ),
        serviceAccountName: serviceAccountNameInput,
        bucket: getInput('bucket', { required: false }),
        bucketObjectName: getInput('bucket-object-name', { required: false }),
        description: getInput('description', { required: false }),
        secrets: resolveLines(
            getMultilineInput('secrets', { required: false }),
            previousVersion && secretsToLines(previousVersion.secrets)
        ),
        networkId: resolveString(getInput('network-id'), previousVersion?.connectivity?.networkId),
        tags: resolveLines(
            getMultilineInput('tags', { required: false }),
            previousVersion && inheritableTags(previousVersion.tags)
        ),
        logsDisabled: resolveBoolean('logs-disabled', previousVersion?.logOptions?.disabled, false),
        logsGroupId: resolveString(getInput('logs-group-id'), previousVersion?.logOptions?.logGroupId),
        logLevel:
            logLevelInput !== ''
                ? parseLogLevel(logLevelInput)
                : (previousVersion?.logOptions?.minLevel ?? LogLevel_Level.LEVEL_UNSPECIFIED),
        async: resolveBoolean('async', previousVersion?.asyncInvocationConfig !== undefined, false),
        asyncSaId: resolveIdOrName(
            asyncSaIdInput,
            asyncSaNameInput,
            previousVersion?.asyncInvocationConfig?.serviceAccountId
        ),
        asyncSaName: asyncSaNameInput,
        asyncRetriesCount: resolveNumber(
            getInput('async-retries-count'),
            previousVersion?.asyncInvocationConfig?.retriesCount,
            DEFAULT_ASYNC_RETRIES_COUNT
        ),
        asyncSuccessYmqArn: resolveString(getInput('async-success-ymq-arn'), successTarget?.queueArn),
        asyncSuccessSaId: resolveIdOrName(
            asyncSuccessSaIdInput,
            asyncSuccessSaNameInput,
            successTarget?.serviceAccountId
        ),
        asyncSuccessSaName: asyncSuccessSaNameInput,
        asyncFailureYmqArn: resolveString(getInput('async-failure-ymq-arn'), failureTarget?.queueArn),
        asyncFailureSaId: resolveIdOrName(
            asyncFailureSaIdInput,
            asyncFailureSaNameInput,
            failureTarget?.serviceAccountId
        ),
        asyncFailureSaName: asyncFailureSaNameInput,
        mounts: resolveLines(
            getMultilineInput('mounts', { required: false }),
            previousVersion && mountsToLines(previousVersion.mounts)
        )
    }
}
