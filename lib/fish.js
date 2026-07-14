const fishTier = {
  trash: [
    'Plastic', 'Stick', 
    'OldBoot', 'RustyCan', 'Seaweed', 'TornNet', 
    'Driftwood', 'SoggyNewspaper', 'BrokenGlass', 'LostKey'
  ],
  common: [
    'Minnow', 'Carp', 
    'Anchovy', 'Sardine', 'Herring', 'Mackerel', 
    'Perch', 'Tilapia', 'Bluegill', 'Chub'
  ],
  uncommon: [
    'Bass', 'Catfish', 
    'Cod', 'Haddock', 'Flounder', 'Pollock', 
    'Crappie', 'Walleye', 'Snapper', 'Halibut'
  ],
  rare: [
    'Salmon', 'Trout', 
    'Tuna', 'MahiMahi', 'Barracuda', 'Grouper', 
    'Sturgeon', 'Marlin', 'Anglerfish', 'Pike'
  ],
  epic: [
    'Goldfish', 'Swordfish', 
    'Coelacanth', 'MegamouthShark', 'Oarfish', 'ElectricEel', 
    'Arowana', 'GhostKoi', 'WhaleShark', 'Hammerhead'
  ],
  something: [
    'DukeFishron',
    'Emas74Kilogram',
    'CurlyPanties',
    'Pignon'
  ]
}




function goFishing(bait = 'Worm'){
  const multList = {
    'Worm': 1,
    'StarWorm': 2,
    'TruffleWorm': 50
  }
  let mult = multList[bait] || 0

  let roll = Math.random() / mult
  
  let list = [
    {limit: 0.01, tier: 'something'},
    {limit: 0.05, tier: 'epic'},
    {limit: 0.15, tier: 'rare'},
    {limit: 0.40, tier: 'uncommon'},
    {limit: 0.70, tier: 'common'},
    {limit: 1.00, tier: 'trash'}
  ]
  
  let finalTier = 'common'
  
  for(let item of list){
    if(roll < item.limit){
      finalTier = item.tier
      break
    }
  }
  
  let fishArr = fishTier[finalTier]
  
  let fish = fishArr[Math.floor(Math.random() * fishArr.length)]
  return [fish, finalTier]
}

module.exports = {goFishing}