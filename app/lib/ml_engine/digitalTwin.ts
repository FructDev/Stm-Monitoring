export function calculateExpectedPower(irradianceW: number, tempC: number): number {
    // Modelo simplificado de Regresión Lineal / Gemelo Digital
    // Asumimos un inversor de ej. 3MW nominales (o normalizamos por SCB).
    // Si la SCB soporta 18 strings de ~15A a 1000V = ~270kW pico.
    // Esta constante de calibración (0.27) debería ajustarse por el área real.
    const nominalPowerSCB = 270; // kW pico por SCB
    
    // Si no hay sol, no hay potencia
    if (irradianceW < 20) return 0;

    // Fórmula: Potencia = Nominal * (Irradiancia / 1000) * (1 - CoeficienteTemp * (Temp - 25))
    const tempCoef = 0.004; // Pierde 0.4% por cada grado sobre 25C
    let efficiency = 1 - (tempCoef * (tempC - 25));
    if (efficiency > 1.05) efficiency = 1.05; // Cap at cold temps
    if (efficiency < 0.7) efficiency = 0.7; // Floor at extreme heat

    const expectedKw = nominalPowerSCB * (irradianceW / 1000) * efficiency;
    
    return expectedKw > 0 ? expectedKw : 0;
}
