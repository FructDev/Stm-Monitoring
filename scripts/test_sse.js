const eventData = `{"alarm_silenced":false,"data":{"AirTC":27.355369567871094,"PYR001":752.994140625,"PYR002":1051.9046630859375,"Pt100_1":52.502220153808594,"WIND_SPEED":3.583329916000366,"raw_len":70},"gateway_id":"METEO_4","mid":1,"state":{"last_quality":"Good"}}`;
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
        const meteoKey = packet.gateway_id;
        const meteoData = {
            gateway_id: packet.gateway_id,
            ts: isoTs,
            ...packet.data
        };
        console.log("Success METEO:", meteoData);
    } else {
        console.log("Success SCB");
    }
} catch (e) {
    console.error("Error:", e);
}
