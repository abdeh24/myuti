const btch = require('btch-downloader')

async function download(type, url) {
  const methodMap = {
    "yt": "youtube",
    "tt": "ttdl",
    "x": "twitter",
    "fb": "fbdown",
    "ig": "igdl"
  }

  const methodName = methodMap[type]

  if(!methodName){
    throw new Error(`Unsupported download type: ${type}`)
  }

  try{
    const result = await btch[methodName](url)
    const video = 
      result.result?.[0]?.url ||
      result.HD ||
      result.Normal_video ||
      result.video?.[0] ||
      result.mp4 ||
      result.url?.[0]?.hd ||
      'Unable to get Video'

    const audio = 
      result.audio?.[0] ||
      result.mp3 ||
      'Unable to get audio'
    
    const finalResult = `You're charged with 10 Tokens\n> Do *.support* for support\nvideo: ${video}\n\naudio: ${audio}`
    return finalResult
    
  }catch(err){
    console.error(`[Downloader Error] Failed to fetch ${type} from ${url}:`, err.message)
    throw err
  }
}

module.exports = {download}