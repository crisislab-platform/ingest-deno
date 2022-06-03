/* global WebSocketPair */

export class Controller {
  constructor(controller, env) {
    this.controller = controller
    this.storage = controller.storage
    this.env = env

    this.ingestSessions = {}

    this.lastPings = {}
  }

  async fetch(request) {
    let url = new URL(request.url)

    // console.log(url.pathname)

    console.log('sensors', JSON.stringify(this.ingestSessions))

    if (url.pathname.startsWith('/ingestors')) {
      console.log('ingestor connecting')
      // The request is to `/api/room/<name>/websocket`. A client is trying to establish a new
      // WebSocket session.
      if (request.headers.get('Upgrade') != 'websocket') {
        console.log('Upgrade header is not websocket')
        return new Response('expected websocket', { status: 400 })
      }

      let [client, server] = Object.values(new WebSocketPair())

      const sensor = parseInt(url.pathname.split('/').pop())

      const duration = parseInt(url.searchParams.get('duration'))

      setTimeout(() => {
        server.close()
        closeOrErrorHandler()
      }, duration * 1000 + 1000)

      // We're going to take pair[1] as our end, and return pair[0] to the client.
      // await this.handleSession(pair[1], sensor);

      server.accept()

      this.ingestSessions[sensor] ||= []

      // If this is the first session for this sensor, we set the sensor status to online
      if (this.ingestSessions[sensor].length === 0) {
        this.controller.waitUntil(
          (async () => {
            let id = this.env.ATOMIC_KV.idFromName('GENERAL')

            const storage = await this.env.ATOMIC_KV.get(id)

            console.log("sending patch with " + JSON.stringify({
              id: sensor,
              online: true,
            }))

            await storage.fetch('http://AtomicKV/GENERAL/sensors/' + sensor, {
              method: 'PATCH',
              body: JSON.stringify({ online: true }),
            })
          })(),
        )
      }

      this.ingestSessions[sensor].push(server)

      let closeOrErrorHandler = () => {
        {
          this.controller.waitUntil(
            (async () => {
              this.ingestSessions[sensor] = this.ingestSessions[sensor].filter(
                (session) => session !== server,
              )

              // Check for sensors that have no more sessions.
              if (this.ingestSessions[sensor].length === 0) {
                let id = this.env.ATOMIC_KV.idFromName('GENERAL')

                const storage = await this.env.ATOMIC_KV.get(id)

                console.log("sending patch with " + JSON.stringify({
                  id: sensor,
                  online: false,
                }))

                if (this.ingestSessions[sensor].length === 0)
                  await storage.fetch('http://AtomicKV/GENERAL/sensors/' + sensor, {
                    method: 'PATCH',
                    body: JSON.stringify({ online: false }),
                  })
              }
            })()
          )
        }

      }

      server.addEventListener('close', closeOrErrorHandler)
      server.addEventListener('error', closeOrErrorHandler)

      console.log('ingestor connected')
      // Now we return the other end of the pair to the client.
      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname.startsWith('/sensor/')) {
      const action = url.pathname.split('/').at(-1)
      const sensor = parseInt(url.pathname.split('/').at(-2))

      console.log(action, sensor)

      const ingestors = this.ingestSessions[sensor]

      if (ingestors) {
        var quitters = []
        await Promise.all(
          ingestors
            .map((ingestor) => {
              try {
                this.lastPings[sensor] = Date.now()
                return ingestor.send(JSON.stringify({ action }))
              } catch (err) {
                quitters.push(ingestor)
                return null
              }
            })
            .filter((x) => x != null),
        )
        for (let quitter of quitters) {
          this.ingestSessions[sensor] = this.ingestSessions[sensor].filter(
            (session) => session !== quitter,
          )
        }
        return new Response('Initializing...', { status: 200 })
      } else {
        return new Response('Ingestor not found', { status: 404 })
      }
    }
  }
}
