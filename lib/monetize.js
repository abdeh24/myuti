async function generateSafelink(targetUrl, apiToken){
  const apiUrl = 'https://safelinku.com/api/v1/links'

  try{
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({url: targetUrl})
    })

    const data = await response.json()

    if(response.ok){
      return data.url
    }else{
      console.error("SafelinkU API Error Response:", data)
      return null
    }
  }catch(err){
    console.error("Monetize Network Error:", err)
    return null
  }
}

module.exports = {generateSafelink}
