import { expect, test } from '@jest/globals'
import { envMapToLines, mountsToLines, secretsToLines } from '../src/inherit'
import { Mount_Mode } from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/serverless/functions/v1/function'

test('envMapToLines converts a version environment map back into KEY=value lines', () => {
    expect(envMapToLines({ FOO: 'bar', BAZ: 'qux' })).toEqual(['FOO=bar', 'BAZ=qux'])
})

test('envMapToLines returns an empty array for an empty map', () => {
    expect(envMapToLines({})).toEqual([])
})

test('secretsToLines converts version secrets back into the short syntax', () => {
    const lines = secretsToLines([
        { id: 'secret-id', versionId: 'version-id', key: 'secret-key', environmentVariable: 'DB_PASSWORD' }
    ])
    expect(lines).toEqual(['DB_PASSWORD=secret-id/version-id/secret-key'])
})

test('secretsToLines skips secrets with no bound environment variable', () => {
    const lines = secretsToLines([
        { id: 'secret-id', versionId: 'version-id', key: 'secret-key', environmentVariable: undefined }
    ])
    expect(lines).toEqual([])
})

test('mountsToLines converts Object Storage mounts back into short syntax', () => {
    const lines = mountsToLines([
        { name: 'data', mode: Mount_Mode.READ_WRITE, objectStorage: { bucketId: 'my-bucket', prefix: '' } },
        { name: 'images', mode: Mount_Mode.READ_ONLY, objectStorage: { bucketId: 'my-bucket', prefix: 'photos' } }
    ])
    expect(lines).toEqual(['data:my-bucket', 'images:my-bucket/photos:ro'])
})

test('mountsToLines skips non-Object-Storage mounts', () => {
    const lines = mountsToLines([
        { name: 'scratch', mode: Mount_Mode.READ_WRITE, ephemeralDiskSpec: { size: 1024, blockSize: 0 } }
    ])
    expect(lines).toEqual([])
})
