const { access, readFile, writeFile } = require('fs/promises')
const path = './src/ttt.json'

async function checkTTTDB(){
  try{
    await access(path)
  }catch{
    await writeFile(path, JSON.stringify({}))
  }
}

async function readTTT(){
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
}

async function writeTTT(data){
  await writeFile(path, JSON.stringify(data, null, 2))
}

function renderBoard(roomId, gameData){
  const id = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']
  const marks = ['❎', '🅾️']
  let b = gameData.board.map((cell, index) => {
    if(cell === 0) return marks[0]
    if(cell === 1) return marks[1]
    return id[index]
  })

  let text = `*TikTakTo: ${roomId}*\n\n`
  text += `${b[0]}${b[1]}${b[2]}\n${b[3]}${b[4]}${b[5]}\n${b[6]}${b[7]}${b[8]}\n\n`
  
  text += `Player 1 ❎: @${gameData.player[0].split('@')[0]}\n`
  if(gameData.player[1]){
    text += `Player 2 🅾️: @${gameData.player[1].split('@')[0]}\n\n`
    text += `*Turn:* @${gameData.player[gameData.turn].split('@')[0]}`
  } else {
    text += `Player 2 🅾️: [Waiting...]`
  }
  text += `\nUse *.resign* to exit current TTT game.`
  return text
}

function checkWin(board){
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ]
  for(let combo of lines){
    const [a, b, c] = combo
    if(board[a] !== " " && board[a] === board[b] && board[a] === board[c]){
      return board[a]
    }
  }
  return null
}

function checkDraw(board){
  return !board.includes(" ")
}

module.exports = { checkTTTDB, readTTT, writeTTT, renderBoard, checkWin, checkDraw }
