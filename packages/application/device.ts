import type { Device, DeviceKeys } from '@ks-finance/domain/device'
import type { UserProfile } from '@ks-finance/domain/user-profile'
import type { DeviceStore } from './device-store'
import { z } from 'zod'

const deviceName = z
  .string()
  .trim()
  .min(1, '请输入设备名称。')
  .max(100, '设备名称最多 100 字。')

async function generateKeys() {
  const [encryption, signing] = await Promise.all([
    crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
      'deriveBits',
    ]),
    crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]),
  ])
  const [encryption_public_key, signing_public_key] = await Promise.all([
    crypto.subtle.exportKey('jwk', encryption.publicKey),
    crypto.subtle.exportKey('jwk', signing.publicKey),
  ])
  return {
    encryption_public_key: JSON.stringify(encryption_public_key),
    signing_public_key: JSON.stringify(signing_public_key),
    encryption_private_key: encryption.privateKey,
    signing_private_key: signing.privateKey,
  }
}

const displayName = z
  .string()
  .trim()
  .min(1, '请输入显示名称。')
  .max(100, '显示名称最多 100 字。')
const setupInput = z.object({ displayName, deviceName })

function registeredDevice(
  devices: readonly Device[],
  keys: DeviceKeys | undefined,
) {
  if (
    keys?.encryption_private_key?.type !== 'private' ||
    keys.signing_private_key?.type !== 'private'
  )
    return undefined
  return devices.find(
    (device) =>
      device.id === keys.device_id &&
      device.user_id === keys.user_id &&
      !device.revoked_at &&
      !!device.encryption_public_key &&
      !!device.signing_public_key,
  )
}

export function createDeviceService(store: DeviceStore) {
  return {
    load: () =>
      store.read(async (repository) => {
        const profile = await repository.profile()
        if (!profile) return { devices: [], currentId: undefined }
        const [devices, keys] = await Promise.all([
          repository.list(profile.id),
          repository.keys(profile.id),
        ])
        return { devices, currentId: registeredDevice(devices, keys)?.id }
      }),

    seen: () =>
      store.write(async (repository) => {
        const profile = await repository.profile()
        if (!profile) return
        const [devices, keys] = await Promise.all([
          repository.list(profile.id),
          repository.keys(profile.id),
        ])
        const current = registeredDevice(devices, keys)
        if (current)
          await repository.save({
            ...current,
            last_seen_at: new Date().toISOString(),
          })
      }),

    setup: async (input: unknown) => {
      const fields = setupInput.parse(input)
      const generated = await generateKeys()
      return store.write(async (repository) => {
        const existing = await repository.profile()
        const now = new Date().toISOString()
        const profile: UserProfile = {
          ...(existing ?? {
            id: crypto.randomUUID(),
            created_at: now,
            status: 'active',
          }),
          display_name: fields.displayName,
        }
        const [devices, keys] = existing
          ? await Promise.all([
              repository.list(existing.id),
              repository.keys(existing.id),
            ])
          : ([[], undefined] as const)
        if (registeredDevice(devices, keys))
          throw new Error('当前浏览器已经登记。')
        const device: Device = {
          id: crypto.randomUUID(),
          user_id: profile.id,
          name: fields.deviceName,
          encryption_public_key: generated.encryption_public_key,
          signing_public_key: generated.signing_public_key,
          created_at: now,
          last_seen_at: now,
        }
        await repository.register(
          profile,
          device,
          {
            user_id: profile.id,
            device_id: device.id,
            encryption_private_key: generated.encryption_private_key,
            signing_private_key: generated.signing_private_key,
          },
          keys?.device_id,
        )
      })
    },

    rename: (id: string, input: unknown) => {
      const name = deviceName.parse(input)
      return store.write(async (repository) => {
        const profile = await repository.profile()
        const device =
          profile &&
          (await repository.list(profile.id)).find((item) => item.id === id)
        if (!device || device.revoked_at) throw new Error('找不到有效的设备。')
        await repository.save({ ...device, name })
      })
    },

    renameUser: (userId: string, input: unknown) => {
      const display_name = displayName.parse(input)
      return store.write(async (repository) => {
        const profile = await repository.profile()
        if (profile?.id !== userId)
          throw new Error('当前用户已变更，请重新进入应用。')
        await repository.saveProfile({ ...profile, display_name })
      })
    },

    unregister: (userId: string) =>
      store.write(async (repository) => {
        const profile = await repository.profile()
        if (profile?.id !== userId)
          throw new Error('当前用户已变更，请重新进入应用。')
        await repository.unregister(userId, new Date().toISOString())
      }),
  }
}
