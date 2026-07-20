const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer": "https://www.roblox.com/",
  "Origin": "https://www.roblox.com",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site",
  "Connection": "keep-alive"
}

let log = ""

async function getUserIdFromUsername(username){
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...BROWSER_HEADERS
    },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false
    })
  })

  const data = await response.json()

  if(data.data && data.data.length > 0){
    return data.data[0].id
  }else{
    log += `> Could not find a Roblox user named "${username}".\n`
  }
}

const AdmZip = require('adm-zip')
const path = require('path')

function getCdnUrl(fileHash){
  if(typeof fileHash !== 'string') throw new Error(`Invalid fileHash: expected string, got ${typeof fileHash}`)
  
  if(fileHash.startsWith('http://') || fileHash.startsWith('https://')) return fileHash

  let i = 31
  const len = Math.min(fileHash.length, 32)
  for(let t = 0; t < len; t++){
    i ^= fileHash.charCodeAt(t)
  }
  return `https://t${(i % 8).toString()}.rbxcdn.com/${fileHash}`
}

async function downloadBufferWithFallback(fileHash, label){
  if(typeof fileHash === 'string' && fileHash.startsWith('http')){
    const response = await fetch(fileHash, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(30000)
    })
    if(!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    return Buffer.from(await response.arrayBuffer())
  }

  const primaryUrl = getCdnUrl(fileHash)
  const urlsToTry = [primaryUrl]

  const computedNum = parseInt(primaryUrl.match(/t(\d)/)[1], 10)
  for(let n = 0; n < 8; n++){
    if(n !== computedNum){
      urlsToTry.push(`https://t${n}.rbxcdn.com/${fileHash}`)
    }
  }

  let lastError = null
  for(const url of urlsToTry){
    try{
      const response = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(30000)
      })
      if(response.ok){
        return Buffer.from(await response.arrayBuffer())
      }
      lastError = `HTTP ${response.status}: ${response.statusText} (${url})`
    }catch(err){
      lastError = `${err.message} (${url})`
    }
  }

  throw new Error(`All CDN servers failed for ${label}. Last error: ${lastError}`)
}

async function getRobloxAvatar(userName, userId, apiKey){
  try{
    log += `> Requesting 3D avatar data for User ID: ${userId}...\n`

    const initialApiUrl = `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`
    const headers = {'x-api-key': apiKey}

    let targetData = null
    let attempts = 0
    const maxAttempts = 6

    while(attempts < maxAttempts){
      const response = await fetch(initialApiUrl, {headers, signal: AbortSignal.timeout(30000)})
      const rawJson = await response.json()

      if(rawJson.errors){
        const errorMessage = rawJson.errors[0]?.message || 'Unknown Error'
        log += `\n>Roblox API rejected the request. Reason: ${errorMessage}\n`
        log += "> Make sure your API key is correct and has the 'thumbnails' and 'read' permissions enabled!\n"
        return
      }

      if('state' in rawJson){
        targetData = rawJson
      }else if(rawJson.data && rawJson.data.length > 0){
        targetData = rawJson.data[0]
      }else{
        log += '> Unexpected API response format.\n'
        return
      }

      const state = targetData.state
      if(state === 'Completed'){
        break
      }else if(state === 'Pending'){
        attempts++
        log += `> Avatar render is Pending. Retrying in 3 seconds... (Attempt ${attempts}/${maxAttempts})\n`
        await new Promise(resolve => setTimeout(resolve, 3000))
      }else{
        log += `> Avatar render failed. Roblox API State: ${state}\n`
        return
      }
    }

    if(!targetData || targetData.state !== 'Completed'){
      log += "> Avatar is stuck on Pending. Roblox's API is likely failing to render this specific user.\n"
      return
    }

    log += '> Render completed! Fetching file hashes...\n'

    const hashJsonUrl = targetData.imageUrl
    const hashResponse = await fetch(hashJsonUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(30000)
    })
    const hashData = await hashResponse.json()

    log += `> hashData keys: ${Object.keys(hashData).join(', ')}\n`
    if(hashData.obj) log += `> obj hash: ${hashData.obj}\n`
    if(hashData.mtl) log += `> mtl hash: ${hashData.mtl}\n`

    const zip = new AdmZip()
    const folderName = `avatar_${userId}_${userName}`

    log += '> Downloading .obj file...\n'
    const objBuffer = await downloadBufferWithFallback(hashData.obj, '.obj')
    zip.addFile(`${folderName}/${userId}.obj`, objBuffer)

    log += '> Downloading .mtl file...\n'
    const mtlBuffer = await downloadBufferWithFallback(hashData.mtl, '.mtl')
    let mtlContent = mtlBuffer.toString('utf-8')

    mtlContent = 'newmtl default\n' + mtlContent
    zip.addFile(`${folderName}/${userId}.mtl`, Buffer.from(mtlContent, 'utf-8'))

    log += '> Downloading textures...\n'
    for(const textureHash of hashData.textures || []){
      let textureUrl, textureFileName
      if(typeof textureHash === 'string' && textureHash.startsWith('http')){
        textureUrl = textureHash
        try{
          const urlPath = new URL(textureHash).pathname
          const pathParts = urlPath.split('/')
          textureFileName = pathParts[pathParts.length - 1].split('?')[0]
        }catch{
          textureFileName = textureHash.slice(-32).replace(/[^a-zA-Z0-9]/g, '')
        }
      }else{
        textureUrl = getCdnUrl(textureHash)
        textureFileName = textureHash
      }
      const texBuffer = await downloadBufferWithFallback(textureUrl, `texture ${textureFileName}`)
      zip.addFile(`${folderName}/${textureFileName}.png`, texBuffer)
    }

    const zipName = `avatar_${userId}_${userName}.zip`
    console.log(zipName)

    const outputPath = path.join(__dirname, '../src/tmp', zipName)

    zip.writeZip(outputPath)

    log += `> Avatar successfully packaged into: src/tmp/${zipName}\n`
    return zipName
  }catch(e){
    log += `> An error occurred: ${e.message || e}\n`
  }
}

async function download(username, KEY){
  log = "If success you're charged with 10 tokens\n> Do *.support* for support\n\nLog:\n"
  let info = ['None', 'None', 'None']

  let userID = await getUserIdFromUsername(username)

  if(typeof(userID) != 'number'){
    info[0] = log
    return info
  }

  let filePath = await getRobloxAvatar(username, userID, KEY)

  if(filePath){
    info[1] = filePath
    info[2] = "Exist"
  }else{
    info[1] = "None"
    info[2] = "Error"
  }

  info[0] = log
  return info
}

module.exports = {download}
