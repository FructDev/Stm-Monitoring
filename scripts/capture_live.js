const http = require('http');

let captured = {};
const req = http.get('http://localhost:3030/live', (res) => {
    res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        lines.forEach(l => {
            if (l.startsWith('data:')) {
                try {
                    const parsed = JSON.parse(l.replace('data:', '').trim());
                    if (parsed.gateway_id && parsed.gateway_id.startsWith('METEO_')) {
                        if (!captured[parsed.gateway_id]) {
                            captured[parsed.gateway_id] = parsed;
                            console.log('--- CAPTURED ' + parsed.gateway_id + ' ---');
                            console.log(JSON.stringify(parsed, null, 2));
                        }
                    }
                } catch(e) {}
            }
        });
    });
});

setTimeout(() => {
    req.destroy();
    console.log('Finished capturing.');
    console.log('Total stations seen:', Object.keys(captured).length);
    process.exit(0);
}, 5000);
