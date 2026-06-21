const {access, readFile, writeFile} = require('fs/promises')
const path = './src/user_db.json'
const ldbPath = './src/leaderboard.txt'

//note: once per start (maybe)
async function checkDB() {
  try{
    await access(path)
    console.log(`${path} found, you may continue...`)
    return
  }catch(err){
    if(err.code === 'ENOENT'){
      const data = {}
      const strData = JSON.stringify(data, null, 2)
      await writeFile(path, strData)
      console.log(`No ${path} found, creating new one...`)
      return
    }
    throw err
  }
}

const keyDefaultData = {
  username: "Default",
  isAfk: false,
  afkTime: 0,
  afkReason: "",
  longestAfkTime: 0,
  isInT3: false,
  t3RoomID: 0,
  token: 500,
}

//note: after text received(you have to call this when messages received, so that you could edit the object later)
async function readDB(key = 'example@s.whatsapp.net', isJustRead = false) {
  const rawData = await readFile(path, 'utf8')
  const data = JSON.parse(rawData)
  if(!data[key]){
    if(isJustRead == true) return
    //console.log(`Missing data for key ${key}, adding default data to key...`)
    await writeDB(key, {})
    return {...keyDefaultData}
  }else{
    //console.log(`Data for key ${key} found...`)
    return data[key]
  }
}

//note: after command finished(send the edited data to localdb)
async function writeDB(key = 'example@s.whatsapp.net', newData = {}){
  const rawData = await readFile(path, 'utf8')
  const db = JSON.parse(rawData)
  let oldData = db[key]
  
  if(!oldData){
    db[key] = {...keyDefaultData, ...newData}
  }else{
    db[key] = {...oldData, ...newData}
  }
  
  await writeFile(path, JSON.stringify(db, null, 2))
}

async function updateLeaderboards() {
  try {
    const rawData = await readFile(path, 'utf8')
    const db = JSON.parse(rawData)
    const users = Object.values(db).filter(user => user.username)

    const tokenSorted = [...users].sort((a, b) => b.token - a.token)
    let tokenText = "Token Leaderboard\n"
    tokenSorted.forEach((user, index) => {
      tokenText += `${index + 1}. ${user.username}: ${user.token}\n`
    })

    const timeSorted = [...users].sort((a, b) => b.longestAfkTime - a.longestAfkTime)
    let timeText = "\nTime Leaderboard\n"
    timeSorted.forEach((user, index) => {
      let days = Math.floor(user.longestAfkTime / (1000 * 60 * 60 * 24))
      let time = new Date(user.longestAfkTime).toISOString().slice(11, 19)
      let timeString = days > 0 ? `${days} days, ${time}` : time
      timeText += `${index + 1}. ${user.username}: *${timeString}*\n`
    })

    const fullLeaderboardText = tokenText + timeText
    await writeFile(ldbPath, fullLeaderboardText, 'utf8')
    console.log('Leaderboards successfully updated in leaderboard.txt')
  } catch (err) {
    console.error('Error updating leaderboards:', err)
  }
}

module.exports = {checkDB, readDB, writeDB, updateLeaderboards}