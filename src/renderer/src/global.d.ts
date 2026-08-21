import type { PrimeApi } from '../../preload/index'

declare global {
  interface Window {
    prime: PrimeApi
  }
}
export {}
