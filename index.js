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

const execPromise = util.promisify(exec)

const PHONE_NUMBER = process.env.PHONE_NUMBER
const OWNER_PHONE_NUMBER = process.env.OWNER_PHONE_NUMBER
const RBX_KEY = process.env.RBX_KEY

const osInfo = `
\`\`\`Server Info\`\`\`
> Platform: ${os.platform()}
> Architecture: ${os.arch()}
> Release: ${os.release()}
> Hostname: ${os.hostname()}
> Total Memory: ${(os.totalmem() / 1e9).toFixed(2)} GB
> Free Memory: ${(os.freemem() / 1e9).toFixed(2)} GB
`


const userCooldowns = new Map()
const COOLDOWN_TIME = 2500

const cmdList =[
  '.about',
  '.menu',
  '.sticker',
  '.s',
  '.whenyah',
  'when',
  '.admin',
  '.afk',
  '.me',
  '.downloader',
  '.ytd',
  '.igd',
  '.ttd',
  '.fbd',
  '.twd',
  '.goon',
  '.rbx',
  '.support',
  '.roll',
  '.leaderboard'
  ]

async function simulateTyping(sock, jid, duration = 1500) {
  await sock.sendPresenceUpdate('composing', jid)
  await new Promise(resolve => setTimeout(resolve, duration))
}

async function isUpdateExist(){
  try{
    const {stdout} = await execPromise('git pull')
    
    if(stdout.includes('Already up to date.')){
      return "No new updates found."
    }
    
    return "Updates pulled successfully! You can now .kill the process..."
  }catch(error){
    return `Error executing git pull: ${error.message}`
  }
}

async function main(){
  await localdb.checkDB()
  let menuText = ''
  try{
    menuText = fs.readFileSync('./src/INFO.txt', 'utf8')
    menuText = menuText.split(';')
  }catch(err){
    console.error(err)
  }
  
  const {state, saveCreds} = await useMultiFileAuthState('./AUTH')
  const {version} = await fetchLatestBaileysVersion()
  console.log(`Baileys Version: ${version.join('.')}`)
  
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({level: 'silent'}),
    printQRInTerminal: false,
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
  sock.ev.on('messages.upsert', async ({type, messages}) => {
    if(type !== 'notify') return
    const msg = messages[0]
    if(!msg.message || msg.key.fromMe) return
    const rawText = msg.message.stickerMessage ? "<sticker>"
    : msg.message.audioMessage ? "<audio>"
    : (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "<not yet implemented>"
      )
    
    const userId = msg.key.participantAlt || msg.key.remoteJidAlt || "error"
    let text = rawText.split(' ')
    let tokenDecrement = 0
    
    if(!msg.key.fromMe){
      console.log(`${userId} | ${msg.pushName}\n> ${rawText}\n=================`)
    }
    const jid = msg.key.remoteJid
    
    let userData = await localdb.readDB(userId, true)
    if(userData){
      if(userData.isAfk == true){
        let msNow = new Date().getTime()
        let msResult = msNow - userData.afkTime
        
        let days = Math.floor(msResult / (1000 * 60 * 60 * 24))
        let time = new Date(msResult).toISOString().slice(11, 19)
        
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
    
    
    if(userId == `${OWNER_PHONE_NUMBER}@s.whatsapp.net`){
      switch(text[0]){
        case '.kill':
          await sock.sendMessage(jid, {text: 'Goodbye...'}, {quoted: msg})
          process.exit(0)
          break
        case '.lmk':
          let log = await isUpdateExist()
          console.log(log)
          await sock.sendMessage(jid, {text: log}, {quoted: msg})
          break
        case '.info':
          await sock.sendMessage(jid, {text: osInfo}, {quoted: msg})
          break
        case '.frp':
          let frpText = (text.slice(1).join(" ")).split("|")
          if(frpText.length == 3){
            let frpMsg = {
              key: {
                fromMe: false,
                participant: `${frpText[0].replace(" ", "")}@s.whatsapp.net`,
                remoteJid: jid,
                id: "FKE" + Math.floor(Math.random() * 1000000000000)
              },
              message: {
                conversation: frpText[2]
              }
            }
            await sock.sendMessage(jid, {text: frpText[1]}, {quoted: frpMsg})
          }else{
            await sock.sendMessage(jid, {text: "Invalid param, correct format:\n.frp 62XXXXXXXXXXX|bot text|reply text"}, {quoted: msg})
          }
          break
      }
    }
    
    if(!cmdList.includes(text[0])) return
    const currentTime = Date.now()
    if (userCooldowns.has(userId)){
      const expirationTime = userCooldowns.get(userId) + COOLDOWN_TIME
      if(currentTime < expirationTime){
        return
      }
    }
    userCooldowns.set(userId, currentTime)

    userData = await localdb.readDB(userId, false)
    
    switch(text[0]){
      case '.about':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[3]}, {quoted: msg})
        break
      case '.menu':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[0]}, {quoted: msg})
        break
      case '.goon' :
        await sock.sendMessage(jid, {text: 'lets goon...!'}, {quoted: msg})
        tokenDecrement = -5
        break
      case '.sticker':
      case '.s':
        if(!msg.message.imageMessage && !msg.message.videoMessage){
          await sock.sendMessage(jid, {text: 'No image found, please attach image'}, {quoted: msg})
        }else if(msg.message.imageMessage){
          sticker.fromImage(sock, jid, msg, downloadMediaMessage)
        }else if(msg.message.videoMessage){
          sticker.fromVideo(sock, jid, msg, downloadMediaMessage)
        }
        tokenDecrement = 5
        break
      case '.whenyah':
      case 'when':
        await sock.sendMessage(jid, {text: 'When when'}, {quoted: msg})
        tokenDecrement = 1
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
        tokenDecrement = 1
        break
      case '.me':
        let meNum = `@${userId.replace('@s.whatsapp.net', '')}`
        let meMsg = `User: ${meNum}\nToken: *${userData.token}*\nLastAfkReason: *${userData.afkReason}*`
        await sock.sendMessage(jid, {text: meMsg, mentions: [userId]}, {quoted: msg})
        break
      case '.admin':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[1]}, {quoted: msg})
        break
      case '.support':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[4]}, {quoted: msg})
        break
      case '.downloader':
        await simulateTyping(sock, jid, 1000)
        await sock.sendMessage(jid, {text: menuText[2]}, {quoted: msg})
        tokenDecrement = 1
        break
      case '.roll':
        if(!text[1] || isNaN(parseFloat(text[1]))){
          await sock.sendMessage(jid, {text: `Please input how much token you want to roll.\nUsage: ${text[0]} <number>`}, {quoted: msg})
          break
        }
        
        let tokenToUse = parseFloat(text[1])
        if(tokenToUse <= 0 || tokenToUse > userData.token){
          await sock.sendMessage(jid, {text: `Invalid token input or not enough token.\nYou have *${userData.token} token*.`}, {quoted: msg})
          break
        }
        let mult = Math.floor(Math.random() * 201) / 100
        let final = Math.floor(Number((tokenToUse * mult).toFixed(2)) * 100) / 100
        await simulateTyping(sock, jid, 1000) 
        await sock.sendMessage(jid, {text: `You got *${final} token*!\n*${tokenToUse}* * *${mult}x* = *${final}*`}, {quoted: msg})
        tokenDecrement = Math.floor(Number((tokenToUse - final).toFixed(2)) * 100) / 100
        break
      case '.ytd':
      case '.igd':
      case '.ttd':
      case '.twd':
      case '.fbd':
        if(!text[1]){
          await sock.sendMessage(jid, {text: `Please provide a link. Usage: ${text[0]} <link>`}, {quoted: msg})
          break
        }
        const typeMap = {
          '.ytd': 'yt',
          '.igd': 'ig',
          '.ttd': 'tt',
          '.twd': 'x',
          '.fbd': 'fb'
        }
        await sock.sendMessage(jid, {text: "Fetching data, please wait..."}, {quoted: msg})
        try{
          const dlResult = await download(typeMap[text[0]], text[1])
          const resultString = typeof dlResult === 'object' ? JSON.stringify(dlResult, null, 2) : String(dlResult)
          await simulateTyping(sock, jid, 2000)
          await sock.sendMessage(jid, {text: resultString}, {quoted: msg})
          tokenDecrement = 10
        }catch(err){
          await sock.sendMessage(jid, {text: "Failed to fetch download links. The link might be invalid or private."}, {quoted: msg})
        }
        break
      case '.leaderboard':
        await simulateTyping(sock, jid, 2000)
        let leaderboardText = await localdb.updateLeaderboards(userData.username)
        await sock.sendMessage(jid, {text: leaderboardText}, {quoted: msg})
        break
      case '.rbx':
        if(!text[1]){
          await sock.sendMessage(jid, {text: `Please provide Roblox Username. Usage: .rbx Abde_4803`}, {quoted: msg})
          break
        }
        await sock.sendMessage(jid, {text: 'Please wait...'}, {quoted: msg})
        
        let info = await rbx.download(text[1], RBX_KEY)
        
        if(info[2] == "None" || info[2] == "Error"){
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
          console.error("Failed to read zip file:", err)
          await sock.sendMessage(jid, {text: "Failed to send the file. It may be corrupted or missing."}, {quoted: msg})
        }
        break
    }
    userData.username = msg.pushName
    userData.token = Number((userData.token - tokenDecrement).toFixed(2))
    await localdb.writeDB(userId, userData)
    
  })
}

main()
