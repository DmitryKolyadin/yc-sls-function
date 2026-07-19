/**
 * Support for "inherit-from-previous-version" deploy mode.
 *
 * Fetches the function's current `$latest` version and converts the parts of it that
 * correspond to action inputs back into the same string/array shapes the action normally
 * reads from `getInput`/`getMultilineInput`. This lets {@link ./resolve-inputs} treat an
 * inherited value exactly like an explicit one, without a second parsing code path.
 *
 * @module
 */

import { info, warning } from '@actions/core'
import { Session } from '@yandex-cloud/nodejs-sdk'
import { functionService } from '@yandex-cloud/nodejs-sdk/serverless-functions-v1'
import { GetFunctionVersionByTagRequest } from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/serverless/functions/v1/function_service'
import {
    Mount,
    Mount_Mode,
    Secret,
    Version
} from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/serverless/functions/v1/function'

/** Tag Yandex Cloud automatically points at the most recently created function version. */
const LATEST_VERSION_TAG = '$latest'

/**
 * Fetches the function's `$latest` version to inherit unspecified settings from.
 *
 * @param session - Authenticated Yandex Cloud SDK session
 * @param functionId - Target function ID
 * @returns The previous version, or `undefined` if the function has no versions yet
 * @throws {Error} If the lookup fails for a reason other than the function having no versions
 */
export async function fetchPreviousVersion(session: Session, functionId: string): Promise<Version | undefined> {
    const client = session.client(functionService.FunctionServiceClient)
    try {
        const version = await client.getVersionByTag(
            GetFunctionVersionByTagRequest.fromPartial({ functionId, tag: LATEST_VERSION_TAG })
        )
        info(`Inheriting unspecified settings from previous version '${version.id}'`)
        return version
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('NOT_FOUND')) {
            info('Function has no previous version yet, nothing to inherit')
            return undefined
        }
        throw err
    }
}

/** Converts a version's environment map back into `KEY=value` lines. */
export function envMapToLines(environment: { [key: string]: string }): string[] {
    return Object.entries(environment).map(([key, value]) => `${key}=${value}`)
}

/** Converts a version's Lockbox secrets back into `ENV_VAR=secretId/versionId/key` lines. */
export function secretsToLines(secrets: Secret[]): string[] {
    const lines: string[] = []
    for (const secret of secrets) {
        if (!secret.environmentVariable) {
            warning(`Skipping inherited Lockbox secret '${secret.id}' with no bound environment variable`)
            continue
        }
        lines.push(`${secret.environmentVariable}=${secret.id}/${secret.versionId}/${secret.key}`)
    }
    return lines
}

/** Converts a version's Object Storage mounts back into short-syntax lines. */
export function mountsToLines(mounts: Mount[]): string[] {
    const lines: string[] = []
    for (const mount of mounts) {
        if (!mount.objectStorage) {
            warning(`Skipping inherited mount '${mount.name}': only Object Storage mounts can be inherited`)
            continue
        }
        const prefix = mount.objectStorage.prefix ? `/${mount.objectStorage.prefix}` : ''
        const readOnly = mount.mode === Mount_Mode.READ_ONLY ? ':ro' : ''
        lines.push(`${mount.name}:${mount.objectStorage.bucketId}${prefix}${readOnly}`)
    }
    return lines
}
