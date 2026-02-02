import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Definimos la estructura mínima que necesitamos comparar
interface DeviceData {
  ps: string;
  scb: number;
  inversor: number;
  status: string;
}

export function useScadaAlerts(currentData: DeviceData[]) {
  // Usamos useRef para guardar el estado anterior sin provocar re-renderizados visuales
  const prevDataRef = useRef<Map<string, string>>(new Map());
  const isFirstLoad = useRef(true);

  useEffect(() => {
    // 1. Si es la primera carga, solo guardamos el estado y no molestamos
    if (isFirstLoad.current) {
      if (currentData.length > 0) {
        currentData.forEach((d) => {
          const key = `${d.ps}-${d.inversor}-${d.scb}`;
          prevDataRef.current.set(key, d.status);
        });
        isFirstLoad.current = false;
      }
      return;
    }

    // 2. Comparar Datos Nuevos vs Viejos
    currentData.forEach((device) => {
      const key = `${device.ps}-${device.inversor}-${device.scb}`;
      const prevStatus = prevDataRef.current.get(key);
      const currentStatus = device.status;

      // DETECCIÓN DE CAÍDA (Estaba OK/ALERTA y pasó a OFFLINE/FAIL)
      // Ignoramos si ya estaba mal antes para no spamear
      const wasAlive =
        prevStatus === "OK" ||
        prevStatus === "BAJA_TENSION" ||
        prevStatus?.startsWith("ALERTA");
      const isDead =
        currentStatus === "OFFLINE" || currentStatus === "READ_FAIL";

      if (wasAlive && isDead) {
        // 🔔 DISPARAR TOAST DE ERROR
        toast.error(`Fallo de Comunicación`, {
          description: `⚠️ ${device.ps} - SCB ${device.scb} (Inv ${device.inversor}) ha dejado de comunicar.`,
          duration: 10000, // Se queda 10 segundos
        });
      }

      // (Opcional) DETECCIÓN DE RECUPERACIÓN
      const wasDead = prevStatus === "OFFLINE" || prevStatus === "READ_FAIL";
      const isAlive = currentStatus === "OK";

      if (wasDead && isAlive) {
        // 🔔 DISPARAR TOAST DE ÉXITO
        toast.success(`Recuperación Exitosa`, {
          description: `✅ ${device.ps} - SCB ${device.scb} está en línea nuevamente.`,
          duration: 5000,
        });
      }

      // 3. Actualizar la referencia para la próxima vuelta
      prevDataRef.current.set(key, currentStatus);
    });
  }, [currentData]); // Se ejecuta cada vez que llega data nueva del backend
}
