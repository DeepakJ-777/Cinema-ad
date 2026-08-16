export function useToast() {
  const message = useState<string | null>('cc:toast', () => null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function push(msg: string) {
    message.value = msg
    if (import.meta.client) {
      clearTimeout(timer)
      timer = setTimeout(() => {
        message.value = null
      }, 3600)
    }
  }

  return { message, push }
}
