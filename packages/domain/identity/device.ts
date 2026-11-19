export interface Device {
  id: string
  user_id: string
  name: string
  encryption_public_key: string
  signing_public_key: string
  created_at: string
  last_seen_at: string
  revoked_at?: string
}

export interface DeviceKeys {
  user_id: string
  device_id: string
  encryption_private_key: CryptoKey
  signing_private_key: CryptoKey
}
