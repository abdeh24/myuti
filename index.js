require('dotenv').config()
const {default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion} = require('@whiskeysockets/baileys')
const fs = require('fs')
const path = require('path')
const pino = require('pino')

const PHONE_NUMBER = process.env.PHONE_NUMBER

async function main(){
  const {state, saveCreds} = await useMultiFileAuthState('./AUTH')
  const {version} = await fetchLatestBaileysVersion()
  console.log(`Baileys Version: ${version.join('.')}`)
  
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino(),
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
    console.log(msg)
  })
}

main()
