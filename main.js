let db = require('./lib/localdbshit.js')

async function main(){
  await db.checkDB()
  let a = await db.readDB("67i@heh.vorp", true)
  console.log(!a)
  //data.token -= 1
  
  //await db.writeDB("67@heh.vorp", {token: data.token})
}

main()
