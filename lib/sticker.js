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

async function toMedia(sock, jid, msg, downloadMediaMessage) {
    const tmpDir = os.tmpdir();
    
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || !quoted.stickerMessage) {
        return sock.sendMessage(jid, { text: "No Sticker replied, please reply to the sticker..." }, { quoted: msg });
    }

    const stickerMessage = quoted.stickerMessage;
    const isAnimated = stickerMessage.isAnimated;

    const ext = isAnimated ? 'mp4' : 'png';
    const tempFile = path.join(tmpDir, `media_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`);

    try {
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const fakeQuotedMsg = {
            key: msg.message.extendedTextMessage.contextInfo.fakeObj?.key || {},
            message: quoted
        };

        const buffer = await downloadMediaMessage(fakeQuotedMsg, 'buffer', {}, {});
        
        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        // Initialize ffmpeg explicitly with the stream and input format
        const ff = ffmpeg();
        ff.input(bufferStream)
          .inputFormat('webp');

        if (!isAnimated) {
            // Output for static stickers
            ff.toFormat('image2');
        } else {
            // Output for animated stickers (GIFs)
            ff.toFormat('mp4')
              .videoCodec('libx264')
              .outputOptions([
                  '-pix_fmt yuv420p',
                  '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                  '-movflags', 'frag_keyframe+empty_moov'
              ]);
        }

        ff.save(tempFile)
            .on('end', async () => {
                try {
                    const fileContent = fs.readFileSync(tempFile);
                    if (!isAnimated) {
                        await sock.sendMessage(jid, { image: fileContent, caption: "Image\n-5 tokens" }, { quoted: msg });
                    } else {
                        await sock.sendMessage(jid, { video: fileContent, gifPlayback: true, caption: "Gif\n-5 tokens" }, { quoted: msg });
                    }
                } catch (err) {
                    await sock.sendMessage(jid, { text: String(err) }, { quoted: msg });
                } finally {
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                }
            })
            .on('error', async (err) => {
                try {
                    await sock.sendMessage(jid, { text: String(err.message) }, { quoted: msg });
                } catch (e) {
                    console.error(e);
                }
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            });

    } catch (downloadError) {
        await sock.sendMessage(jid, { text: String(downloadError) }, { quoted: msg });
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
}





module.exports = {fromImage, fromVideo, toMedia}
