export interface EntityMessage {
  type: 'update' | 'delete'
  entity_id: string
  name?: string
  latitude?: number
  longitude?: number
  ontology?: string
  disposition?: string // MIL-STD-2525 affiliation: hostile | friendly | neutral | suspect | unknown
  updated_at?: string
}

export class EntityWebSocket {
  private ws: WebSocket | null = null
  private url: string
  private onMessage: (msg: EntityMessage) => void
  private onError: (err: string) => void
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  constructor(url: string, onMessage: (msg: EntityMessage) => void, onError: (err: string) => void) {
    this.url = url
    this.onMessage = onMessage
    this.onError = onError
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('WS connected')
          this.reconnectAttempts = 0
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const msg: EntityMessage = JSON.parse(event.data)
            this.onMessage(msg)
          } catch (e) {
            console.error('Failed to parse WS message:', e)
          }
        }

        this.ws.onerror = (event) => {
          const err = `WS error: ${event}`
          console.error(err)
          this.onError(err)
          reject(new Error(err))
        }

        this.ws.onclose = () => {
          console.log('WS closed')
          this.attemptReconnect()
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onError(`Max reconnect attempts (${this.maxReconnectAttempts}) reached`)
      return
    }

    this.reconnectAttempts++
    const delay = Math.pow(2, this.reconnectAttempts) * 1000
    console.log(`Reconnecting in ${delay}ms...`)

    setTimeout(() => {
      this.connect().catch((e) => {
        console.error('Reconnect failed:', e)
      })
    }, delay)
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}
