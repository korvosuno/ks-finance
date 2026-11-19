import type {
  DeviceRepository,
  DeviceStore,
} from '@ks-finance/application/device-store'
import type { FinanceDatabase } from '../database'

export function createDexieDeviceStore(database: FinanceDatabase): DeviceStore {
  const { user_profiles, devices, device_keys } = database
  const tables = [user_profiles, devices, device_keys]
  const repository: DeviceRepository = {
    profile: () =>
      user_profiles.filter((profile) => profile.status === 'active').first(),
    list: (userId) => devices.where('user_id').equals(userId).toArray(),
    keys: (userId) => device_keys.get(userId),
    async save(device) {
      await devices.put(device)
    },
    async saveProfile(profile) {
      await user_profiles.put(profile)
    },
    async register(profile, device, keys, previousId) {
      await user_profiles.put(profile)
      if (previousId) {
        await devices
          .where('id')
          .equals(previousId)
          .filter(
            (previous) =>
              previous.user_id === profile.id && !previous.revoked_at,
          )
          .modify({ revoked_at: device.created_at })
      }
      await devices.add(device)
      await device_keys.put(keys)
    },
    async unregister(userId, revoked_at) {
      await devices
        .where('user_id')
        .equals(userId)
        .filter((device) => !device.revoked_at)
        .modify({ revoked_at })
      await device_keys.delete(userId)
      await user_profiles.delete(userId)
    },
  }
  return {
    read: (run) => database.transaction('r', tables, () => run(repository)),
    write: (run) => database.transaction('rw', tables, () => run(repository)),
  }
}
