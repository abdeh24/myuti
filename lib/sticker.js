const fs = require('fs')
const path = require('path')
const os = require('os')
const stream = require('stream')
const ffmpeg = require('fluent-ffmpeg')

async function fromImage(sock, jid, msg, downloadMediaMessage){
  const tmpDir = os.tmpdir() 
  const tempFile = path.join(tmpDir, `sticker_${Date.now()}_${Math.floor(Math.random() * 1000)}.webp`)
  
  try{
    if(!fs.existsSync(tmpDir)){
      fs.mkdirSync(tmpDir, {recursive: true})
    }

    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {})

    const bufferStream = new stream.PassThrough()
    bufferStream.end(buffer)

    ffmpeg(bufferStream)
      .inputFormat('image2pipe')
      .outputOptions([
        "-vf", "format=rgba,scale='if(gt(iw,ih),512,-1)':'if(gt(iw,ih),-1,512)',pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000"
      ])
      .outputFormat('webp')
      .save(tempFile)
      .on('end', async () => {
        try{
          await sock.sendMessage(
            jid,
            {sticker: fs.readFileSync(tempFile)},
            {quoted: msg}
          )
        }catch(sendError){
          await sock.sendMessage(jid, {text: String(sendError)}, {quoted: msg})
        }finally{
          if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
        }
      })
      .on('error', async (err) => { 
        try{
          await sock.sendMessage(jid, {text: String(err.message)}, {quoted: msg})
        }catch(e){
          console.error(e)
        }
        if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
      })

  }catch(downloadError){
    await sock.sendMessage(jid, {text: String(downloadError)}, {quoted: msg})
    if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
  }
}

async function fromVideo(sock, jid, msg, downloadMediaMessage){
  const tmpDir = os.tmpdir()
  const tempFile = path.join(tmpDir, `sticker_${Date.now()}_${Math.floor(Math.random() * 1000)}.webp`)
  
  try{
    if(!fs.existsSync(tmpDir)){
      fs.mkdirSync(tmpDir, {recursive: true})
    }

    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {})

    const bufferStream = new stream.PassThrough()
    bufferStream.end(buffer)

    ffmpeg(bufferStream)
      .inputOptions([
        "-t", "00:00:06" 
      ])
      .outputOptions([
        "-vcodec", "libwebp",
        "-vf", "fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000",
        "-loop", "0",
        "-preset", "default",
        "-an",
        "-vsync", '0',
        "-q:v", "20",
      ])
      .outputFormat('webp')
      .save(tempFile)
      .on('end', async () => {
        try{
          await sock.sendMessage(jid, {sticker: fs.readFileSync(tempFile)}, {quoted: msg})
        }catch(sendError){
          await sock.sendMessage(jid, {text: String(sendError)}, {quoted: msg})
        }finally{
          if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
        }
      })
      .on('error', async (err) => { 
        try{
          await sock.sendMessage(jid, {text: String(err.message)}, {quoted: msg})
        }catch(e){
          console.error(e)
        }
        if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
      })

  }catch(downloadError){
    await sock.sendMessage(jid, {text: String(downloadError)}, {quoted: msg})
    if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
  }
}


async function toMedia(sock, jid, msg, downloadMediaMessage){
  const tmpDir = os.tmpdir()
  const id = `${Date.now()}_${Math.floor(Math.random() * 1000)}`
  const inFile = path.join(tmpDir, `toimg_in_${id}.webp`)
  const outFile = path.join(tmpDir, `toimg_out_${id}`)

  try{
    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
    if(!quoted?.stickerMessage){
      await sock.sendMessage(jid, {text: 'Reply to sticker with .toimg'}, {quoted: msg})
      return
    }

    const buffer = await downloadMediaMessage(
      {message: quoted, key: msg.message.extendedTextMessage.contextInfo.stanzaId ? {...msg.key, id: msg.message.extendedTextMessage.contextInfo.stanzaId} : msg.key},
      'buffer',
      {},
      {}
    )
    fs.writeFileSync(inFile, buffer)

    const probe = await new Promise((resolve) => {
      ffmpeg.ffprobe(inFile, (err, data) => {
        if(err) return resolve(null)
        const stream = data.streams.find(s => s.codec_type === 'video')
        resolve(stream ? Number(stream.nb_frames || 0) : 0)
      })
    })

    const isAnimated = probe === null ? buffer.length > 150 * 1024 : probe > 1

    if(!isAnimated){
      const pngFile = outFile + '.png'
      await new Promise((resolve, reject) => {
        ffmpeg(inFile)
          .outputOptions(['-frames:v', '1'])
          .outputFormat('png')
          .save(pngFile)
          .on('end', resolve)
          .on('error', reject)
      })
      await sock.sendMessage(jid, {image: fs.readFileSync(pngFile)}, {quoted: msg})
    }else{
      const gifFile = outFile + '.gif'
      const paletteFile = outFile + '_palette.png'
      const filters = 'fps=15,scale=320:-1:flags=lanczos'

      await new Promise((resolve, reject) => {
        ffmpeg(inFile)
          .outputOptions([`-vf`, `${filters},palettegen=reserve_transparent=1`])
          .outputFormat('image2')
          .save(paletteFile)
          .on('end', resolve)
          .on('error', reject)
      })

      await new Promise((resolve, reject) => {
        ffmpeg(inFile)
          .input(paletteFile)
          .outputOptions([
            `-lavfi`, `${filters} [x]; [x][1:v] paletteuse=alpha_threshold=128`,
            '-loop', '0'
          ])
          .outputFormat('gif')
          .save(gifFile)
          .on('end', resolve)
          .on('error', reject)
      })

      await sock.sendMessage(jid, {video: fs.readFileSync(gifFile), mimetype: 'image/gif', caption: 'animated sticker → gif'}, {quoted: msg})
    }

  }catch(err){
    console.error('[toimg]', err)
    await sock.sendMessage(jid, {text: 'Failed to convert sticker: ' + err.message}, {quoted: msg})
  }finally{
    for(const f of [inFile, outFile + '.png', outFile + '.gif', outFile + '_palette.png']){
      if(fs.existsSync(f)) fs.unlinkSync(f)
    }
  }
}

module.exports = {fromImage, fromVideo, toMedia}
