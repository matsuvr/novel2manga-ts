export function useRouter() {
  return {
    push: (_url: string) => {},
    replace: (_url: string) => {},
    back: () => {},
  }
}

export function useSearchParams() {
  return new URLSearchParams()
}
