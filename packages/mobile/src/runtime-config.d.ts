declare global {
  interface Window {
    __SMARTSTOCK_MOBILE_CONFIG__?: Record<string, unknown>
  }
}

export {}