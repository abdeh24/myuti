require('dotenv').config()
const {default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion} = require('@whiskeysockets/baileys')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const {exec} = require('child_process')
const os = require('node:os')
const util = require('util')
const execPromise = util.promisify(exec)

const PHONE_NUMBER = process.env.PHONE_NUMBER
const OWNER_PHONE_NUMBER = process.env.OWNER_PHONE_NUMBER

const osInfo = `\`\`\`Server Info\`\`\`
> Platform: ${os.platform()}
> Architecture: ${os.arch()}
> Release: ${os.release()}
> Hostname: ${os.hostname()}
> Total Memory: ${(os.totalmem() / 1e9).toFixed(2)} GB
> Free Memory: ${(os.freemem() / 1e9).toFixed(2)} GB`

async function isUpdateExist() {
  try {
    const { stdout } = await execPromise('git pull');
    
    if (stdout.includes('Already up to date.')) {
      return "No new updates found.";
    }
    
    return "Updates pulled successfully! You can now .restart the process...";
  } catch (error) {
    return `Error executing git pull: ${error.message}`;
  }
}

async function main(){
  let menuText = ''
  try{
    menuText = fs.readFileSync('./src/INFO.txt', 'utf8')
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
  sock.ev.on('messages.upsert', async ({messages}) => {
    const msg = messages[0]
    if(!msg.message || msg.key.fromMe) return
    const rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || "none"
    const userId = msg.key.participantAlt || msg.key.remoteJidAlt || "error"
    let text = rawText.split(' ')
    
    if(!msg.key.fromMe){
      console.log(`${userId} | ${msg.pushName}\n> ${rawText}\n=================`)
    }
    
    jid = msg.key.remoteJid
    
    switch(text[0]){
      case '.info':
        await sock.sendMessage(jid, {text: osInfo}, {quoted: msg})
        break
      case '.menu':
        await sock.sendMessage(jid, {text: menuText}, {quoted: msg})
        break
      case '.sticker':
        await sock.sendMessage(jid, {text: 'Belum ada yah'}, {quoted: msg})
        break
      case '.whenyah':
        await sock.sendMessage(jid, {text: 'When when'}, {quoted: msg})
        break
    }
    
    if(userId == `${OWNER_PHONE_NUMBER}@s.whatsapp.net` || userId == `${OWNER_PHONE_NUMBER}@s.whatsapp.net`){
      switch(text[0]){
        case '.restart':
          await sock.sendMessage(jid, {text: 'Restarting...'}, {quoted: msg})
          process.exit(0)
          break
        case '.lmk':
          let log = await isUpdateExist()
          console.log(log)
          await sock.sendMessage(jid, {text: log}, {quoted: msg})
          break
      }
    }
  })
}

main()
