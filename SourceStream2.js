/* global WebSocketPair */

export class SourceStream {
  constructor(controller, env) {
    this.storage = controller.storage
    this.env = env

    this.sourceSessions = []
    this.consumerSessions = []
  }

  async fetch(request) {
    let url = new URL(request.url)
    console.log("Source Stream request", url.pathname)


    if (request.headers.get('Upgrade') != 'websocket') {
      console.log('Upgrade header is not websocket')
      return new Response('expected websocket', { status: 400 })
    }

    this.sensorId = parseInt(url.pathname.split('/').pop())

    let [client, server] = Object.values(new WebSocketPair())

    server.accept()

    if (url.pathname.startsWith('/source')) {
      console.log('source connecting')
      // if (this.consumerSessions.length === 0) {
      //   console.log('no consumers')
      //   return new Response('no consumers', { status: 400 })
      // }
      await this.handleSource(server)
    }

    if (url.pathname.startsWith('/consume')) {
      console.log('consumer connecting')
      await this.handleConsumer(server)
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  async handleSource(ws) {
    this.sourceSessions.push(ws)

    console.log(this.consumerSessions)

    if (this.consumerSessions.length === 0) {
      console.log('no more consumers')
      this.sourceSessions.forEach((session) => {
        session.send('{"action":"quit"}')
        session.close()
      })
      this.sourceSessions = []
      return
    }

    let noClients = false

    ws.addEventListener('message', ({ data }) => {
      // console.log('source message', data)
      // console.log(this.consumerSessions[0] === this.consumerSessions[0], this.consumerSessions[0] === this.consumerSessions[1])
      let quitters = []
      for (var session of this.consumerSessions) {
        try {
          session.send(data)
        } catch (err) {
          console.log("error sending")
          quitters.push(session)
        }
      }

      for (const session of quitters) {
        this.consumerSessions.splice(this.consumerSessions.indexOf(session), 1)
      }

      if (this.consumerSessions.length === 0 && !noClients) {
        noClients = true
        setTimeout(() => {
          if (this.consumerSessions.length === 0) {
            console.log('no more consumers')
            this.sourceSessions.forEach((session) => {
              session.send('{"action":"quit"}')
              session.close()
            })

            this.sourceSessions = []
          }
        }, 10000)
      }
    })

    let closeOrErrorHandler = () => {
      this.sourceSessions = this.sourceSessions.filter(
        (session) => session !== ws,
      )
    }

    ws.addEventListener('close', closeOrErrorHandler)
    ws.addEventListener('error', closeOrErrorHandler)
  }

  async handleConsumer(ws) {
    this.consumerSessions.push(ws)

    if (this.sourceSessions.length === 0) {
      console.log('No sources connected, requesting connection')

      let id = this.env.CONTROLLER.idFromName('adsfa')

      const controller = await this.env.CONTROLLER.get(id)

      controller.fetch(
        'http://controller.ingest/sensor/' + this.sensorId + '/connect',
      )
    }

    let closeOrErrorHandler = () => {
      this.consumerSessions = this.consumerSessions.filter(
        (session) => session !== ws,
      )

      if (this.consumerSessions.length === 0) {
        setTimeout(() => {
          if (this.consumerSessions.length === 0) {
            console.log('no more consumers')
            this.sourceSessions.forEach((session) => {
              session.send('{"action":"quit"}')
              session.close()
            })

            this.sourceSessions = []
          }
        }, 10000)
      }
    }

    ws.addEventListener('close', closeOrErrorHandler)
    ws.addEventListener('error', closeOrErrorHandler)
  }
}
