require('dotenv').config()
const {default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage} = require('@whiskeysockets/baileys')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const {exec} = require('child_process')
const os = require('node:os')
const util = require('util')

const sticker = require('./lib/sticker')
const localdb = require('./lib/localdbshit')
const {download} = require('./lib/downloader')
const rbx = require('./lib/rbx')
const ttt = require('./lib/ttt')
const fish = require('./lib/fish')

const execPromise = util.promisify(exec)

const PHONE_NUMBER = process.env.PHONE_NUMBER
const OWNER_PHONE_NUMBER = process.env.OWNER_PHONE_NUMBER
const RBX_KEY = process.env.RBX_KEY
const SAFELINKU_TOKEN = process.env.SAFELINKU_TOKEN 
const EXTRA_SAFELINKU = process.env.EXTRA_SAFELINKU

// #region GLOBAL EMPTY VAR {
let monetize = () => {}

let days = 0
let time = 0
// #endregion }

if(EXTRA_SAFELINKU === 'enabled'){
  monetize = require('./lib/monetize')
}

const userCooldowns = new Map()
const COOLDOWN_TIME = 2500

const cmdList = [
  '.menu', '.help', '.about', '.info', '.tools', '.downloader', '.games', 
  '.leaderboard', '.other', '.support', '.admin', '.update', '.ytd', '.fbd',
  '.igd', '.ttd', '.twd', '.inv', '.afk', '.ttt', '.fish',
  '.sell', '.buy', '.roll', '.roll%', '.s', '.toimg', '.rbx',
  '.me', '.whenyah', 'whenyah', '.when', 'when', '.freetoken', '.claim',
  '.resign', '.goon', '.daily', '.fish', '.sell', '.buy'
]

async function checkToken(sock, jid, msg, tokenNeeded, userToken){
  if(tokenNeeded <= userToken) return false
  sock.sendMessage(jid, {text: `Not enough tokens for this command!\nNeed ${tokenNeeded} Tokens\nYour token: ${userToken}\nNeed token? Do .goon or .freetoken`}, {quoted: msg})
  return true
}

async function simulateTyping(sock, jid, duration = 1500){
  await sock.sendPresenceUpdate('composing', jid)
  await new Promise(resolve => setTimeout(resolve, duration))
}

async function isUpdateExist(){
  try{
    const {stdout} = await execPromise('git pull')
    
    if(stdout.includes('Already up to date.')){
      return 'No new updates found.'
    }
    
    return 'Updates pulled successfully! You can now .kill the process...'
  }catch(error){
    return `Error executing git pull: ${error.message}`
  }
}

async function main(){
  await localdb.checkDB()
  await ttt.checkTTTDB()
  let menuText = ''
  try{
    menuText = fs.readFileSync('./src/INFO.txt', 'utf8')
    menuText = menuText.split(/====\r?\n/)
  }catch(err){
    console.error(err)
  }
  // #region BAILEYS SETUP {
  const {state, saveCreds} = await useMultiFileAuthState('./AUTH')
  const {version} = await fetchLatestBaileysVersion()
  console.log(`Baileys Version: ${version.join('.')}`)
  
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({level: 'silent'}),
    printQRInTerminal: false
  })

  if(!sock.authState.creds.registered){
    if(!PHONE_NUMBER) return console.log('! ERROR HERE !\n\nPHONE_NUMBER does not exist in .env')
    setTimeout(async () => {
      try{
        const code = await sock.requestPairingCode(PHONE_NUMBER)
        console.log(`Pairing Code for ${PHONE_NUMBER}: ${code}\n`)
      }catch(err){
        console.log(`! ERROR HERE !\n\n${err}\n`)
      }
    }, 3000)
  }
  
  sock.ev.on('creds.update', saveCreds)
  
  sock.ev.on('connection.update', (update) => {
    const {connection, lastDisconnect} = update
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
      if(shouldReconnect) setTimeout(main, 2000)
    }else if(connection === 'open'){
      console.log(`Bot connected as ${PHONE_NUMBER}\n`)
    }
  })
  // #endregion }
  
  sock.ev.on('messages.upsert', async ({type, messages}) => {
    if(type !== 'notify') return
    const msg = messages[0]
    if(!msg.message || msg.key.fromMe) return
    const rawText = msg.message.stickerMessage ? '<sticker>'
    : msg.message.audioMessage ? '<audio>'
    : (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '<not yet implemented>'
      )
    
    const userId = msg.key.participantAlt || msg.key.remoteJidAlt || 'error'
    let text = rawText.split(' ')
    let tokenDecrement = 0
    text[0] = text[0].toLowerCase()
    
    
    if(!msg.key.fromMe){
      console.log(`~~~~~~~~~~~~\n${userId} | ${msg.pushName}\n> ${rawText}`)
    }
    
    const jid = msg.key.remoteJid
    let userData = await localdb.readDB(userId, true)
    
    // #region TTT MOVE {
    const moveMatch = rawText.match(/^[1-9]$/)
    if(text[0] == '.resign' && userData && userData.isInT3){
      const dbTTT = await ttt.readTTT()
      const room = dbTTT[userData.t3RoomID]
      if(room){
        for(let p of room.player){
          let pData = await localdb.readDB(p, false)
          pData.isInT3 = false
          pData.t3RoomID = 0
          await localdb.writeDB(p, pData)
        }
        await sock.sendMessage(jid, {text: `User @${userId.split('@')[0]} resigned from TTT:${userData.t3RoomID}`, mentions: room.player})
      }

      delete dbTTT[userData.t3RoomID]
      await ttt.writeTTT(dbTTT)
      return 
    }else if(moveMatch && userData && userData.isInT3){
      const position = parseInt(rawText) - 1
      const dbTTT = await ttt.readTTT()
      const room = dbTTT[userData.t3RoomID]

      if(room){
        if(room.player[room.turn] !== userId){
          await sock.sendMessage(jid, {text: 'It is not your turn!'}, {quoted: msg})
          return
        }
        if(room.board[position] !== ' '){
          await sock.sendMessage(jid, {text: 'That spot is already taken!'}, {quoted: msg})
          return
        }

        room.board[position] = room.turn
        
        const winner = ttt.checkWin(room.board)
        const isDraw = ttt.checkDraw(room.board)

        if(winner !== null){
          const boardText = ttt.renderBoard(userData.t3RoomID, room)
          await sock.sendMessage(jid, {text: `${boardText}\n\n@${userId.split('@')[0]} wins the game!`, mentions: room.player})
          
          for(let p of room.player){
            let pData = await localdb.readDB(p, false)
            pData.isInT3 = false
            pData.t3RoomID = 0
            if(p == userId){
              pData.tttWin = (pData.tttWin || 0) + 1 
            }
            await localdb.writeDB(p, pData)
          }
          delete dbTTT[userData.t3RoomID]
          await ttt.writeTTT(dbTTT)
          return
        }

        if(isDraw){
          const boardText = ttt.renderBoard(userData.t3RoomID, room)
          await sock.sendMessage(jid, {text: `${boardText}\n\nThe game is a draw!`, mentions: room.player})
          
          for(let p of room.player){
            let pData = await localdb.readDB(p, false)
            pData.isInT3 = false
            pData.t3RoomID = 0
            await localdb.writeDB(p, pData)
          }
          delete dbTTT[userData.t3RoomID]
          await ttt.writeTTT(dbTTT)
          return
        }

        room.turn = room.turn === 0 ? 1 : 0
        await ttt.writeTTT(dbTTT)

        const boardText = ttt.renderBoard(userData.t3RoomID, room)
        await sock.sendMessage(jid, {text: boardText, mentions: room.player})
        return 
      }
    }
    // #endregion }
    
    // #region CHECK AFK {
    if(userData){
      if(userData.isAfk == true){
        let msNow = new Date().getTime()
        let msResult = msNow - userData.afkTime
        
        days = Math.floor(msResult / (1000 * 60 * 60 * 24))
        time = new Date(msResult).toISOString().slice(11, 19)
        let timeString = days > 0 ? `${days} days, ${time}` : time
        
        let afkReason = userData.afkReason
        let afkMsg = ''
        if(afkReason == ''){
          afkMsg = `You've stopped afk with no reason.\nAfk time: *${timeString}*`
        }else{
          afkMsg = `You've stopped afk with reason:\n*${afkReason}*\nAfk time: *${timeString}*`
        }
        await sock.sendMessage(jid, {text: afkMsg}, {quoted: msg})
        if(userData.longestAfkTime < msResult){
          userData.longestAfkTime = msResult
          console.log(`\n\n\n${userData.longestAfkTime}\n\n\n`)
        }
        console.log(`\n\n\n${msResult}\n\n\n`)
        userData.isAfk = false
        await localdb.writeDB(userId, userData)
      }
    }
    // #endregion }
    
    // #region TEXT FROM OWNER {
    if(userId == `${OWNER_PHONE_NUMBER}@s.whatsapp.net`){
      switch(text[0]){
        case '.update':
          let log = await isUpdateExist()
          console.log(log)
          await sock.sendMessage(jid, {text: log}, {quoted: msg})
          break
        case '.kill':
          await sock.sendMessage(jid, {text: 'Goodbye...'}, {quoted: msg})
          process.exit(0)
          break
        case '.frp':
          let frpText = (text.slice(1).join(' ')).split('|')
          if(frpText.length == 3){
            let frpMsg = {
              key: {
                fromMe: false,
                participant: `${frpText[0].replace(' ', '')}@s.whatsapp.net`,
                remoteJid: jid,
                id: 'FKE' + Math.floor(Math.random() * 1000000000000)
              },
              message: {
                conversation: frpText[2]
              }
            }
            await sock.sendMessage(jid, {text: frpText[1]}, {quoted: frpMsg})
          }else{
            await sock.sendMessage(jid, {text: 'Invalid param, correct format:\n.frp 62XXXXXXXXXXX|bot text|reply text'}, {quoted: msg})
          }
          break
        case ',':
          const cmdToRun = text.slice(1).join(' ')
          
          if(cmdToRun == ''){
            await sock.sendMessage(jid, {text: 'Invalid.\nUsage: , echo'}, {quoted: msg})
            break
          }
          
          try{
            const {stdout, stderr} = await execPromise(cmdToRun, {timeout: 10000})
            
            const output = stdout || stderr || 'Success, no output...'
            await sock.sendMessage(jid, {text: output.trim()}, {quoted: msg})
          }catch(error){
            const output = error.stdout || error.stderr || error.message;
            await sock.sendMessage(jid, {text: output.trim()}, {quoted: msg})
          }
          break
      }
    }
    // #endregion }
    
    // #region CHECK USER MESSAGES {
    if(!cmdList.includes(text[0])) return
    const currentTime = Date.now()
    if(userCooldowns.has(userId)){
      const expirationTime = userCooldowns.get(userId) + COOLDOWN_TIME
      if(currentTime < expirationTime){
        return
      }
    }
    // #endregion }
    
    userCooldowns.set(userId, currentTime)
    
    userData = await localdb.readDB(userId, false)
    
    // #region TEXT FROM USER {
    switch(text[0]){
      // #region MAIN COMMANDS {
      case '.menu':
      case '.help':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[0]}, {quoted: msg})
        break
      case '.about':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[3]}, {quoted: msg})
        break
      case '.info':
        let rawUptime = Math.floor(process.uptime())
        
        days = Math.floor(rawUptime / (60 * 60 * 24))
        time = new Date(rawUptime * 1000).toISOString().slice(11, 19)
        let uptime = days > 0 ? `${days} days, ${time}` : time
        
        const osInfo = `\`\`\`SERVER INFO\`\`\`\n> Platform: ${os.platform()}\n> Architecture: ${os.arch()}\n> Release: ${os.release()}\n> Hostname: ${os.hostname()}\n> Total Memory: ${(os.totalmem() / 1e9).toFixed(2)} GB\n> Free Memory: ${(os.freemem() / 1e9).toFixed(2)} GB\n> Bot Uptime: ${uptime}`
        await sock.sendMessage(jid, {text: osInfo}, {quoted: msg})
        break
      case '.tools':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[6]}, {quoted: msg})
        break
      case '.downloader':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[2]}, {quoted: msg})
        break
      case '.games':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[5]}, {quoted: msg})
        break
      case '.leaderboard':
        await simulateTyping(sock, jid, 2000)
        let leaderboardText = await localdb.updateLeaderboards(userData.username)
        await sock.sendMessage(jid, {text: leaderboardText}, {quoted: msg})
        break
      case '.other':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[7]}, {quoted: msg})
        break
      case '.support':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[4]}, {quoted: msg})
        break
      case '.admin':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[1]}, {quoted: msg})
        break
      // #endregion }
      
      // #region DOWNLOADER COMMANDS {
      case '.ytd':
      case '.fbd':
      case '.igd':
      case '.ttd':
      case '.twd':
        if(await checkToken(sock, jid, msg, 10, userData.token) == true) break
        if(!text[1]){
          await sock.sendMessage(jid, {text: `Please provide a link. Usage: ${text[0]} <link>`}, {quoted: msg})
          break
        }
        const typeMap = {
          '.ytd': 'yt',
          '.fbd': 'fb',
          '.igd': 'ig',
          '.ttd': 'tt',
          '.twd': 'x'
        }
        await sock.sendMessage(jid, {text: 'Fetching data, please wait...'}, {quoted: msg})
        try{
          const dlResult = await download(typeMap[text[0]], text[1])
          const resultString = typeof dlResult === 'object' ? JSON.stringify(dlResult, null, 2) : String(dlResult)
          await simulateTyping(sock, jid, 2000)
          await sock.sendMessage(jid, {text: resultString}, {quoted: msg})
          tokenDecrement = 10
        }catch(err){
          await sock.sendMessage(jid, {text: 'Failed to fetch download links. The link might be invalid or private.'}, {quoted: msg})
        }
        break
      // #endregion }
      
      // #region GAMES COMMANDS {
      case '.inv':
        let invMsg = `*@${userId.replace('@s.whatsapp.net', '')} Inventory:*\n`
        let invRes = ''
        if(Object.keys(userData.inv).length > 0){
          invRes = Object.entries(userData.inv)
            .map(([item, amount]) => `> *${item}* x${amount}`)
            .join('\n')
        }
        invMsg += invRes
        await sock.sendMessage(jid, {text: invMsg, mentions: [userId]}, {quoted: msg})
        break
      case '.afk':
        let fullText = text.slice(1).join(' ')
        let responseText = ''
        if(fullText == ''){
          responseText = `You are now afk with no reason.`
        }else{
          responseText = `You are now afk with reason:\n*${fullText}*`
        }
        await sock.sendMessage(jid, {text: responseText}, {quoted: msg})
        userData.isAfk = true
        userData.afkTime = new Date().getTime()
        userData.afkReason = fullText
        break
      case '.ttt':
        if(userData.isInT3){
          await sock.sendMessage(jid, {text: `You are already in a match! Room ID: ${userData.t3RoomID}`}, {quoted: msg})
          break
        }

        const dbTTT = await ttt.readTTT()
        let foundRoomId = null
        
        for(const [id, data] of Object.entries(dbTTT)){
          if(data.player.length === 1){
            foundRoomId = id
            break
          }
        }

        if(foundRoomId){
          dbTTT[foundRoomId].player.push(userId)
          userData.isInT3 = true
          userData.t3RoomID = foundRoomId
          
          await ttt.writeTTT(dbTTT)
          await localdb.writeDB(userId, userData)

          const boardText = ttt.renderBoard(foundRoomId, dbTTT[foundRoomId])
          await sock.sendMessage(jid, {text: `Match found!\n\n${boardText}`, mentions: dbTTT[foundRoomId].player})
        }else{
          const newRoomId = Math.floor(10000000 + Math.random() * 90000000).toString()
          dbTTT[newRoomId] = {
            board: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
            turn: 0,
            player: [userId]
          }
          
          userData.isInT3 = true
          userData.t3RoomID = newRoomId
          
          await ttt.writeTTT(dbTTT)
          await localdb.writeDB(userId, userData)

          const boardText = ttt.renderBoard(newRoomId, dbTTT[newRoomId])
          await sock.sendMessage(jid, {text: boardText, mentions: [userId]})
        }
        break
      case '.fish':
        let fishMsg = ''
        let bait = userData.inv.Worm || userData.inv.StarWorm || userData.inv.TruffleWorm
        if(bait == undefined){
          fishMsg = 'You don\'t have any bait!\n> Go *.buy list*'
          await sock.sendMessage(jid, {text: fishMsg}, {quoted: msg})
          break
        }
        
        let baitUsed = 'Worm'
        if(bait == userData.inv.StarWorm) baitUsed = 'StarWorm'
        if(bait == userData.inv.TruffleWorm) baitUsed = 'TruffleWorm'
        
        let fishInfo = fish.goFishing(baitUsed)
        
        fishMsg = `You got *${fishInfo[0]}*!\n> rarity: *${fishInfo[1]}*\n> -1 *${baitUsed}*`
        
        userData.inv[baitUsed] -= 1
        if(userData.inv[baitUsed] == 0) delete userData.inv[baitUsed]
        
        if(userData.inv[fishInfo[0]] == undefined) userData.inv[fishInfo[0]] = 0
        userData.inv[fishInfo[0]] += 1
        
        await sock.sendMessage(jid, {text: fishMsg}, {quoted: msg})
        break
      case '.sell':
        let totalSellPrice = 0
        let sellMsg = 'You have nothing to sell!\n> See .inv'
        let sellList = {
          'Worm': 1, 'StarWorm': 5, 'TruffleWorm': 66666, 'MToken': 1000,
          
          'Plastic': 0.5, 'Stick': 0.6,
          'OldBoot': 0.8, 'RustyCan': 0.7,
          'Seaweed': 0.5, 'TornNet': 0.9,
          'Driftwood': 0.6, 'SoggyNewspaper': 0.5,
          'Broken Glass': 0.7, 'LostKey': 1.0,
        
          'Minnow': 2, 'Carp': 4,
          'Anchovy': 3, 'Sardine': 5,
          'Herring': 6, 'Mackerel': 8,
          'Perch': 7, 'Tilapia': 9,
          'Bluegill': 10, 'Chub': 4,
        
          'Bass': 12, 'Catfish': 15,
          'Cod': 18, 'Haddock': 11,
          'Flounder': 14,'Pollock': 13,
          'Crappie': 16,'Walleye': 20,
          'Snapper': 19,'Halibut': 22,
        
          'Salmon': 45,'Trout': 28,
          'Tuna': 50,'MahiMahi': 35,
          'Barracuda': 40,'Grouper': 32,
          'Sturgeon': 48,'Marlin': 38,
          'Anglerfish': 42,'Pike': 26,
        
          'Goldfish': 100,'Swordfish': 85,
          'Coelacanth': 95,'MegamouthShark': 92,
          'Oarfish': 88,'ElectricEel': 78,
          'Arowana': 82,'GhostKoi': 98,
          'WhaleShark': 90,'Hammerhead': 75,
          
          'DukeFishron': 66666.66,
          'Emas74Kilogram': 66666.74,
          'CurlyPanties': 66666.21,
          'Pignon': 66666.01
        }
        
        if(Object.keys(userData.inv).length == 0){
          await sock.sendMessage(jid, {text: sellMsg}, {quoted: msg})
          break
        }
        
        let blacklistOnSellAll = ['Worm', 'StarWorm', 'TruffleWorm', 'MToken']
        
        if(text[1] == 'all'){
          sellMsg = 'You sell your inventory...\n'
          let totalItem = 0
          for(let [key, value] of Object.entries(userData.inv)){
            if(blacklistOnSellAll[key] == undefined && sellList[key] != undefined){
              let totalSell = sellList[key] * value
              totalSellPrice += totalSell
              delete userData.inv[key]
              sellMsg += `> Sold *${key} x${value}* for *${totalSell} tokens*.\n`
              totalItem += value
            }
          }
          sellMsg += `\nYou've sold *${totalItem}* items in your inventory!\n> You've been paid *${totalSellPrice} tokens!*`
          tokenDecrement = -totalSellPrice
        }else{
          if(userData.inv[text[1]] != undefined && sellList[text[1]] != undefined){
            let sellAmount = 1
            if(Number.isInteger(Number(text[2])) && Number(text[2]) > 0 && Number(text[2]) <= userData.inv[text[1]]) sellAmount = Number(text[2])
            if(text[2] == 'all') sellAmount = userData.inv[text[1]]
            
            totalSellPrice = sellList[text[1]] * sellAmount
            userData.inv[text[1]] -= sellAmount
            if(userData.inv[text[1]] == 0) delete userData.inv[text[1]]
            tokenDecrement = -totalSellPrice
            sellMsg = `You've sold *${text[1]} x${sellAmount}* for *${totalSellPrice} tokens*.`
          }else{
            sellMsg = 'Invalid! Usage:\n> .sell all\n> .sell <item> <amount>\n> .sell <item> all'
          }
        }
        
        await sock.sendMessage(jid, {text: sellMsg}, {quoted: msg})
        break
      case '.buy':
        let buyMsg = ''
        let itemList = {
          Worm: 1,
          StarWorm: 5,
          TruffleWorm: 66666,
          MToken: 1000
        }
        let buyList = Object.entries(itemList)
          .map(([item, price]) => `${item} = ${price} Token`)
          .join('\n')
        if(text[1] == 'list'){
          buyMsg = '*Item | Price*\n' + buyList
        }else{
          if(itemList[text[1]] != undefined){
            let buyAmount = 1
            if(Number.isInteger(Number(text[2])) && Number(text[2]) > 0) buyAmount = Number(text[2])
            
            let totalPrice = itemList[text[1]] * buyAmount
            if(userData.token < totalPrice){
              buyMsg = `Your token is not enough!\n> You have *${userData.token} tokens*.\n> Total item price: *${totalPrice} token.*`
            }else{
              buyMsg = `You've been charged *${totalPrice} token* for *x${buyAmount} ${text[1]}*!\n> See .inv`
              if(userData.inv[text[1]] == undefined) userData.inv[text[1]] = 0
              userData.inv[text[1]] += buyAmount
              tokenDecrement = totalPrice
            }
          }else{
            buyMsg = 'Invalid! Usage:\n> .buy list\n> .buy <item>\n> .buy <item> <amount>'
          }
        }
        await sock.sendMessage(jid, {text: buyMsg}, {quoted: msg})
        break
      case '.roll':
        if(!text[1]){
          await sock.sendMessage(jid, {text: `Please input how much tokens you want to roll.\nUsage: .roll <number/half/max>`}, {quoted: msg})
          break
        }
        
        let tokenToUse = 0.0
        
        if(text[1] === 'half'){
          tokenToUse = parseFloat((userData.token / 2).toFixed(2)) 
        }else if(text[1] === 'max'){
          tokenToUse = userData.token
        }else if(!isNaN(parseFloat(text[1]))){
          tokenToUse = parseFloat(text[1])
        }else{
          await sock.sendMessage(jid, {text: `Invalid amount.`}, {quoted: msg})
          break
        }
        
        if(tokenToUse <= 0 || tokenToUse > userData.token){
          await sock.sendMessage(jid, {text: `Invalid tokens input or not enough tokens.\nYou have *${userData.token} token*.`}, {quoted: msg})
          break
        }
        
        const tiers = [
          {limit: 0.05, calc: () => 2.50 + (Math.random() * 0.50)}, // 5%
          {limit: 0.20, calc: () => 2.00 + (Math.random() * 0.50)}, // 15
          {limit: 0.45, calc: () => 1.00 + (Math.random() * 1.00)}, // 25
          {limit: 0.75, calc: () => 0.50 + (Math.random() * 0.50)}, // 30
          {limit: 1.00, calc: () => Math.random() * 0.50 } // 25
        ]
        
        const rand = Math.random()
        const matched = tiers.find(t => rand <= t.limit)
        
        const mult = Number((matched ? matched.calc() : 0.00).toFixed(2))
        const final = Math.floor(tokenToUse * mult * 100) / 100
        const diff = Number((final - tokenToUse).toFixed(2))
        
        await simulateTyping(sock, jid, 1000) 
        await sock.sendMessage(jid, {text: `You got *${diff}* tokens!\n> Roll result: *${tokenToUse}* * *${mult}* = *${final}*\n\nYour token: *${tokenToUse}* + *${diff}* = *${final}*`}, {quoted: msg})
        tokenDecrement = Math.floor(Number((tokenToUse - final).toFixed(2)) * 100) / 100
        break
      case '.roll%':
        await sock.sendMessage(jid, {text: 'Roll Probability\n> 2.50 -> 3.00 *5%*\n> 2.00 -> 2.49 *15%*\n> 1.00 -> 2.00 *25%*\n> 0.50 -> 1.00 *30%*\n> 0.00 -> 0.50 *25%*'})
        break
      // #endregion }
      
      // #region TOOLS COMMANDS {
      case '.s':
        if(await checkToken(sock, jid, msg, 5, userData.token) == true) break
        if(!msg.message.imageMessage && !msg.message.videoMessage){
          await sock.sendMessage(jid, {text: 'No media found, please attach media~'}, {quoted: msg})
        }else if(msg.message.imageMessage){
          await sticker.fromImage(sock, jid, msg, downloadMediaMessage)
        }else if(msg.message.videoMessage){
          await sticker.fromVideo(sock, jid, msg, downloadMediaMessage)
        }
        tokenDecrement = 5
        break
      case '.toimg':
        if(await checkToken(sock, jid, msg, 5, userData.token) == true) break
        await sticker.toMedia(sock, jid, msg, downloadMediaMessage)
        tokenDecrement = 5
        break
      case '.rbx':
        if(await checkToken(sock, jid, msg, 10, userData.token) == true) break
        if(!text[1]){
          await sock.sendMessage(jid, {text: `Please provide Roblox Username. Usage: .rbx Abde_4803`}, {quoted: msg})
          break
        }
        await sock.sendMessage(jid, {text: 'Please wait...'}, {quoted: msg})
        
        let info = await rbx.download(text[1], RBX_KEY)
        
        if(info[2] == 'None' || info[2] == 'Error'){
          await sock.sendMessage(jid, {text: info[0]}, {quoted: msg})
          break
        }
        
        await simulateTyping(sock, jid, 2000)
        try{
          await sock.sendMessage(jid, {
            document: fs.readFileSync(`src/tmp/${info[1]}`),
            mimetype: 'application/zip',
            fileName: info[1],
            caption: info[0]
          }, {quoted: msg})
          tokenDecrement = 10
        }catch(err){
          console.error('Failed to read zip file:', err)
          await sock.sendMessage(jid, {text: 'Failed to send the file. It may be corrupted or missing.'}, {quoted: msg})
        }
        break
      // #endregion }
      
      // #region OTHER COMMANDS {
      case '.me':
        let meNum = `@${userId.replace('@s.whatsapp.net', '')}`
        
        days = Math.floor(userData.longestAfkTime / (1000 * 60 * 60 * 24))
        time = new Date(userData.longestAfkTime).toISOString().slice(11, 19)
        let timeString = days > 0 ? `${days} days, ${time}` : time
        
        let meMsg = `User: ${meNum}\n> Token: *${userData.token}*\n> Longest Afk: *${timeString}*\n> Last Afk: *${userData.afkReason}*\n> TTT Win: *${userData.tttWin}*`
        await sock.sendMessage(jid, {text: meMsg, mentions: [userId]}, {quoted: msg})
        break
      case '.whenyah':
      case 'whenyah':
      case '.when':
      case 'when':
        await sock.sendMessage(jid, {text: 'When when'}, {quoted: msg})
        break
      case '.daily':
        let msNow = new Date().getTime()
        let timeResult = msNow - userData.lastDaily
        let dailyMsg = ''
        
        if(userData.lastDaily == 0) timeResult = 86400000
        if(timeResult < 86400000){
          time = new Date(timeResult).toISOString().slice(11, 19)
          dailyMsg = `You already claimed your daily!\n*${time}* Wait for 24 hours.`
        }else{
          dailyMsg = `You get *200* tokens from daily!`
          tokenDecrement = -200
          userData.lastDaily = msNow
        }
        sock.sendMessage(jid, {text: dailyMsg}, {quoted: msg})
        break
      case '.freetoken':
        if(EXTRA_SAFELINKU === 'enabled'){
          const code = Math.random().toString(36).substring(2, 8).toUpperCase()
          userData.claimCode = code
          await localdb.writeDB(userId, userData)
  
          const targetUrl = `https://api.whatsapp.com/send?phone=${PHONE_NUMBER}&text=.claim%20${code}`
          
          await sock.sendMessage(jid, {text: 'Generating 250 tokens link...'}, {quoted: msg})
  
          const shortLink = await monetize.generateSafelink(targetUrl, SAFELINKU_TOKEN)
  
          if(!shortLink){
            await sock.sendMessage(jid, {text: 'Failed to generate link, try again later...'}, {quoted: msg})
            break
          }
  
          await sock.sendMessage(jid, {text: `Complete this link and send the message to get free 250 tokens :3\n*${shortLink}*`}, {quoted: msg})
        }else{
          const code = Math.random().toString(36).substring(2, 8).toUpperCase()
          userData.claimCode = code
          await localdb.writeDB(userId, userData)
  
          const baseUrl = `https://api.whatsapp.com/send?phone=${PHONE_NUMBER}`
          
          const hiddenParam = `&text=.claim%20${code}`
          const maskedUrl = baseUrl + encodeURIComponent(hiddenParam)
  
          const quickLink = `https://sfl.gl/st/?api=${SAFELINKU_TOKEN}&url=${encodeURIComponent(maskedUrl)}`
  
          await sock.sendMessage(jid, {text: `Complete this link and send the code to get free 250 tokens :3\n*${quickLink}*`}, {quoted: msg})
        }
        break
      case '.claim':
        if(!text[1]){
          await sock.sendMessage(jid, {text: `Usage: .claim <code>`}, {quoted: msg})
          break
        }

        if(!userData.claimCode || userData.claimCode !== text[1]){
          await sock.sendMessage(jid, {text: `Code expired, did not exist, or the code is not for you!`}, {quoted: msg})
          break
        }

        userData.token += 250
        userData.claimCode = ''
        await localdb.writeDB(userId, userData)

        await sock.sendMessage(jid, {text: `Thank you~\nYour Tokens: ${userData.token}`}, {quoted: msg})
        break
      case '.goon':
        await sock.sendMessage(jid, {text: 'lets goon...!\n+5 tokens.'}, {quoted: msg})
        tokenDecrement = -5
        break
      // #endregion }

    }
    // #endregion }
    
    userData.username = msg.pushName
    userData.token = Number((userData.token - tokenDecrement).toFixed(2))
    await localdb.writeDB(userId, userData)
    
  })
}

main()
