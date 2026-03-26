const eventData = `{"alarm_silenced":true,"data":{"currents":[246,173],"expected_current":9.77},"gateway_id":"PS9","inversor":1,"mid":9,"scb":9,"state":{"consecutive_failures":0,"last_error":null,"last_quality":"Good","last_seen_ts":1773756683805,"latency_ms":1472}}`;
const packet = JSON.parse(eventData);

try {
    const key = `${packet.gateway_id}-${packet.inversor}-${packet.scb}`;
    let mappedStatus = "OK";
    let isoTs = new Date().toISOString();

    if (typeof packet.state === "object" && packet.state !== null) {
        if (packet.state.last_quality === "Offline") mappedStatus = "OFFLINE";
        if (packet.state.last_quality === "Bad") mappedStatus = "READ_FAIL";
        if (packet.state.last_timestamp_ms) {
            isoTs = new Date(packet.state.last_timestamp_ms).toISOString();
        }
    } else if (typeof packet.state === "string") {
        if (packet.state === "Offline") mappedStatus = "OFFLINE";
        if (packet.state === "Bad") mappedStatus = "READ_FAIL";
    }

    if (packet.gateway_id.startsWith("METEO_")) {
        console.log("Success METEO");
    } else {
        const mergedData = {
            power_station: packet.gateway_id,
            inversor: packet.inversor,
            scb: packet.scb,
            ts: isoTs,
            estado: mappedStatus,
            alarm_silenced: packet.alarm_silenced,
            ...packet.data 
        };

        console.log("Success SCB", mergedData);
    }
} catch (e) {
    console.error("Error:", e);
}
