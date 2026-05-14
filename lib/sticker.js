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
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
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
                "-t", "00:00:10" 
            ])
            .outputOptions([
                "-vcodec", "libwebp",
                "-vf", "fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000",
                "-loop", "0",
                "-preset", "default",
                "-an",
                "-vsync", '0'
            ])
            .outputFormat('webp')
            .save(tempFile)
            .on('end', async () => {
                try{
                    await sock.sendMessage(jid, {sticker: fs.readFileSync(tempFile)}, {quoted: msg})
                }catch(sendError){
                    await sock.sendMessage(jid, {text: String(sendError)}, {quoted: msg})
                }finally{
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
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

module.exports = {fromImage, fromVideo}
