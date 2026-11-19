import type { Device, DeviceKeys } from '@ks-finance/domain/device'
import type { UserProfile } from '@ks-finance/domain/user-profile'

export interface DeviceRepository {
  profile(): Promise<UserProfile | undefined>
  list(userId: string): Promise<Device[]>
  keys(userId: string): Promise<DeviceKeys | undefined>
  saveProfile(profile: UserProfile): Promise<void>
  save(device: Device): Promise<void>
  register(
    profile: UserProfile,
    device: Device,
    keys: DeviceKeys,
    previousId?: string,
  ): Promise<void>
  unregister(userId: string, revokedAt: string): Promise<void>
}

export interface DeviceStore {
  read<T>(run: (repository: DeviceRepository) => Promise<T>): Promise<T>
  write<T>(run: (repository: DeviceRepository) => Promise<T>): Promise<T>
}
