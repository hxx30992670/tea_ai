import type { SpeechConfig } from '@/hooks/useSpeech'

declare global {
  interface Window {
    __SMARTSTOCK_MOBILE_CONFIG__?: {
      speech?: SpeechConfig
    }
  }
}

export {}
