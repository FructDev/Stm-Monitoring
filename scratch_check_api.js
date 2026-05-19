const http = require('http');

http.get('http://127.0.0.1:3030/snapshot', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log("Keys in snapshot:", Object.keys(parsed));
      const firstKey = Object.keys(parsed)[0];
      console.log(`Snapshot for ${firstKey}:`);
      console.log(JSON.stringify(parsed[firstKey], null, 2).substring(0, 500));
    } catch(e) {
      console.log("Error parsing JSON:", e);
      console.log("Raw data:", data.substring(0, 500));
    }
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
