const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
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
    log = log + `> Could not find a Roblox user named "${username}".\n`
  }
}

const AdmZip = require('adm-zip')
const path = require('path')

function getCdnUrl(fileHash){
  let i = 31
  for(const char of fileHash){
    i ^= char.charCodeAt(0)
  }
  return `https://t${i % 8}.rbxcdn.com/${fileHash}`
}

async function downloadBuffer(url){
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if(!response.ok){
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function getRobloxAvatar(userName, userId, apiKey){
  try{
    log = log + `> Requesting 3D avatar data for User ID: ${userId}...\n`

    const initialApiUrl = `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`
    const headers = { 'x-api-key': apiKey }

    let targetData = null
    let attempts = 0
    const maxAttempts = 6

    while(attempts < maxAttempts){
      const response = await fetch(initialApiUrl, { headers, signal: AbortSignal.timeout(30000) })
      const rawJson = await response.json()

      if(rawJson.errors){
        const errorMessage = rawJson.errors[0]?.message || 'Unknown Error'
        log = log + `\n>Roblox API rejected the request. Reason: ${errorMessage}\n`
        log = log + "> Make sure your API key is correct and has the 'thumbnails' and 'read' permissions enabled!\n"
        return
      }

      if('state' in rawJson){
        targetData = rawJson
      } else if(rawJson.data && rawJson.data.length > 0){
        targetData = rawJson.data[0]
      } else{
        log = log + '> Unexpected API response format.\n'
        return
      }

      const state = targetData.state
      if(state === 'Completed'){
        break
      } else if(state === 'Pending'){
        attempts++
        log = log + `> Avatar render is Pending. Retrying in 3 seconds... (Attempt ${attempts}/${maxAttempts})\n`
        await new Promise(resolve => setTimeout(resolve, 3000))
      } else{
        log = log + `> Avatar render failed. Roblox API State: ${state}\n`
        return
      }
    }

    if(!targetData || targetData.state !== 'Completed'){
      log = log + "> Avatar is stuck on Pending. Roblox's API is likely failing to render this specific user.\n"
      return
    }

    log = log + '> Render completed! Fetching file hashes...\n'

    const hashJsonUrl = targetData.imageUrl
    const hashResponse = await fetch(hashJsonUrl, { signal: AbortSignal.timeout(30000) })
    const hashData = await hashResponse.json()

    const zip = new AdmZip()
    const folderName = `avatar_${userId}_${userName}`

    const objUrl = getCdnUrl(hashData.obj)
    const mtlUrl = getCdnUrl(hashData.mtl)

    log = log + '> Downloading .obj file...\n'
    const objBuffer = await downloadBuffer(objUrl)
    zip.addFile(`${folderName}/${userId}.obj`, objBuffer)

    log = log + '> Downloading .mtl file...\n'
    const mtlResponse = await fetch(mtlUrl, { signal: AbortSignal.timeout(30000) })
    
    if(!mtlResponse.ok) throw new Error(`Failed to fetch MTL: ${mtlResponse.status}`)
    let mtlContent = await mtlResponse.text()

    mtlContent = 'newmtl default\n' + mtlContent
    zip.addFile(`${folderName}/${userId}.mtl`, Buffer.from(mtlContent, 'utf-8'))

    log = log + '> Downloading textures...\n'
    for(const textureHash of hashData.textures || []){
      const textureUrl = getCdnUrl(textureHash)
      const texBuffer = await downloadBuffer(textureUrl)
      zip.addFile(`${folderName}/${textureHash}.png`, texBuffer)
    }

    const zipName = `avatar_${userId}_${userName}.zip`
    console.log(zipName)
    
    const outputPath = path.join(__dirname, '../src/tmp', zipName) 
    
    zip.writeZip(outputPath)

    log = log + `> Avatar successfully packaged into: src/tmp/${zipName}\n`
    return zipName
  } catch(e){
    log = log + `> An error occurred: ${e.message || e}\n`
  }
}

async function download(username, KEY){
  log = "Can you support me? :3\nDo *.support* for support :33\nLog:\n"
  let info = ['None', 'None', 'None']
  
  let userID = await getUserIdFromUsername(username)
  
  if(typeof(userID) != 'number'){
  info[0] = log
  return info
  }
  info[2] = "Exist"
  
  let filePath = await getRobloxAvatar(username, userID, KEY)
  info[1] = filePath
  info[0] = log
  return info
}

module.exports = {download}
