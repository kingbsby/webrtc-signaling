const http = require('http')
const https = require('https')
const socketIo = require('socket.io')
const express = require('express')
const { readFileSync } = require('fs')
const { join } = require('path')

const app = express()

const path = file => readFileSync(join(__dirname, 'cert', file))

// 设置跨域访问
app.all("*", function (req, res, next) {
  // 设置允许跨域的域名， * 代表允许任意域名跨域
  res.header("Access-Control-Allow-Origin", "*")
  // 允许的header 类型
  res.header("Access-Control-Allow-Headers", "content-type")
  // 跨域允许的请求方式
  res.header(
    "Access-Control-Allow-Methods",
    "DELETE ,PUT ,POST ,GET ,OPTIONS"
  );
  if (req.method.toLowerCase() == "options ") {
    res.send(200) // 让options 尝试请求快速结束
  } else {
    next()
  }
})


const users = new Map()
const rooms = new Map()

//HTTP 服务
const http_server = http.createServer(app)
http_server.listen(8888)

const options = {
  key: path('key.pem'),
  cert: path('cert.pem'),
  requestCert: true,
  ca: [
    path('client-cert.pem')
  ]
}
const https_server = https.createServer(options, app)



const io = socketIo(https_server, {
  cors: {
    origin: '*'
  }
})

// 处理连接事件
io.sockets.on('connection', (socket) => {
  // socket.emit() 向建立该连接的客户端广播（自己）
  // socket.broadcast.emit() ：向除去建立该连接的客户端的所有客户端广播（除自己外的所有人）
  // io.sockets.emit() ：向所有客户端广播，等同于上面两个的和
  const { key } = socket.handshake.query
  // 登录
  users.set(key, { socket, room: '' })
  // 加好友
  socket.on('friend', (msg) => {
    const { name, img, account_id, toId } = msg
    const { socket } = users.get(toId)
    socket?.emit('friend', { name, img, account_id })
  })
  // 获取在线好友
  socket.on('online', (ids) => {
    socket.emit('online', ids.map(id => users.has(id)))
  })
  // offer
  socket.on('offer', ({ offer, toId, type, media, isMeta, play }) => {
    console.log(`offer - toid: ${toId}, type: ${type}`);
    const { socket } = users.get(toId)
    socket?.emit('offer', { offer, type, media, isMeta, play, from: key })
  })
  // answer
  socket.on('answer', ({ answer, toId, type }) => {
    console.log(`answer - toid: ${toId}, type: ${type}`);
    const { socket } = users.get(toId)
    socket?.emit('answer', { answer, type, from: key })
  })
  // candidate
  socket.on('candidate', ({ candidate, toId, type }) => {
    console.log(`candidate - toid: ${toId}, type: ${type}`);
    const { socket } = users.get(toId)
    socket?.emit('candidate', { candidate, type, from: key })
  })
  // close
  socket.on('close', ({ toId, type }) => {
    console.log(`close - toid: ${toId}, type: ${type}`);
    const { socket } = users.get(toId)
    socket?.emit('close', { type })
    users.set(toId, { socket, room: '' })
  })
  // join
  socket.on('join', ({ room, play }) => {
    users.set(key, { socket, room })
    if (!rooms.has(room)) rooms.set(room, new Map())
    const playMap = rooms.get(room)
    if (playMap.size < 15) {
      const plays = []
      playMap.forEach(_play => plays.push(_play))
      socket.emit('join', { plays })
      playMap.set(key, play)
    } else {
      socket.emit('join', { plays: undefined })
    }
  })

  // quit
  socket.on('quit', ({ room }) => {
    users.set(key, { socket, room: '' })
    quitRoom(room, key)
  })

  // disconnect
  socket.on('disconnect', () => {
    const user = users.get(key)
    if (!user) return
    if (user.room) quitRoom(user.room, key)
    users.delete(key)
    socket.broadcast.emit('leave', key)
  })
})

/**
 * 退出房间并通知房间内的玩家
 * @param {*} room 房间id
 * @param {*} key 退出房间用户id
 * @returns 
 */
function quitRoom (room, key) {
  const playMap = rooms.get(room)
  playMap.delete(key)
  if (playMap.size === 0) return rooms.delete(room)
  playMap.forEach((play, _key) => {
    const { socket } = users.get(_key)
    socket?.emit('quit', { key })
  })
}
