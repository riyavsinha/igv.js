import handleMessage from "./messageHandler.js"

export function createWebSocketClient(host: string, port: number, browser: any): void {

    let socket: WebSocket
    let retryInterval: number = 1000    // Initial retry interval in ms
    const maxRetryInterval: number = 10000 // Maximum retry interval in ms
    let reconnectTimer: ReturnType<typeof setTimeout>
    let intentionalClose: boolean = false // Flag to prevent reconnection on intentional close

    function connect(): void {

        const isLocal: boolean = host === 'localhost' || host === '127.0.0.1'
        const protocol: string = window.location.protocol === 'https:' && !isLocal ? 'wss:' : 'ws:'
        socket = new WebSocket(`${protocol}//${host}:${port}`)

        //  helper to safely send
        const sendJSON = (obj: any): void => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(obj))
            }
        }

        socket.addEventListener('open', function (event: Event): void {
            retryInterval = 1000 // Reset retry interval on successful connection
            sendJSON({message: 'Hello from browser client'})
        })

        // Listen for incoming messages
        socket.addEventListener('message', async function (event: MessageEvent): Promise<void> {
            try {
                const json = JSON.parse(event.data)

                if("close" === json.type) {
                    intentionalClose = true
                    clearTimeout(reconnectTimer)
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.close()
                    }
                    return
                }

                const returnMsg = await handleMessage(json, browser)
                sendJSON(returnMsg)

            } catch (e: any) {
                if (e instanceof SyntaxError) {
                    console.warn('Received non-JSON message from server:', event.data)
                } else {
                    console.error('Error handling message:', e)
                    sendJSON({
                        status: 'error',
                        message: `Error handling message: ${e.message || e.toString()}`
                    })
                }
            }
        })

        socket.addEventListener('error', function (event: Event): void {
            console.error('WebSocket error:', event)
            // The 'close' event will fire immediately after 'error', triggering the reconnect logic.
        })

        socket.addEventListener('close', function (event: CloseEvent): void {
            if (intentionalClose) {
                console.log('WebSocket closed intentionally. Not reconnecting.')
                return
            }
            console.log('Disconnected from server. Retrying in ' + (retryInterval / 1000) + ' seconds.')
            clearTimeout(reconnectTimer)
            reconnectTimer = setTimeout(connect, retryInterval)
            // Increase retry interval for next time, up to a max
            retryInterval = Math.min(maxRetryInterval, retryInterval * 2)
        })
    }

    connect() // Initial connection attempt

    window.addEventListener('beforeunload', function (event: BeforeUnloadEvent): void {
        clearTimeout(reconnectTimer) // Don't try to reconnect when page is closing
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close()
        }
    })
}

export default createWebSocketClient
