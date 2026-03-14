type EventHandler = (...args: unknown[]) => unknown

class EventEmitter {

    eventHandlers: Map<string, EventHandler[]>

    constructor() {
        // Map of event name -> [ handlerFn, ... ]
        this.eventHandlers = new Map()
    }

    on(eventName: string, fn: EventHandler): void {
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, [])
        }
        this.eventHandlers.get(eventName)!.push(fn)
    }


    /**
     * @deprecated use off()
     */
    un(eventName: string, fn: EventHandler): void {
        this.off(eventName, fn)
    }


    off(eventName?: string, fn?: EventHandler): void {

        if (!eventName) {
            this.eventHandlers.clear()   // Remove all event handlers
        } else if (!fn) {
            this.eventHandlers.delete(eventName) // Remove all eventhandlers matching name
        } else {
            // Remove specific event handler
            const handlers = this.eventHandlers.get(eventName)
            if (!handlers || handlers.length === 0) {
                console.warn("No handlers to remove for event: " + eventName)
            } else {
                const callbackIndex = handlers.indexOf(fn)
                if (callbackIndex !== -1) {
                    handlers.splice(callbackIndex, 1)
                }
            }
        }
    }

    emit(eventName: string, args?: unknown[], thisObj?: unknown): unknown {

        const handlers = this.eventHandlers.get(eventName)
        if (undefined === handlers || handlers.length === 0) {
            return undefined
        }

        const scope = thisObj || globalThis
        const results = handlers.map(function (handler) {
            return handler.apply(scope, args)
        })

        // The only event that uses the return value is "trackclick", which implicitly assumes a single handler
        return results[0]
    }
}

export {EventEmitter}
