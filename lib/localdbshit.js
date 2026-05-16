const {access, readFile, writeFile} = require('fs/promises')
const path = './src/user_db.json'

//note: once per start (maybe)
async function checkDB() {
  try{
    await access(path);
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
  isAfk: false,
  afkTime: 0,
  isInT3: false,
  t3RoomID: 0,
  token: 1000
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

module.exports = {checkDB, readDB, writeDB}