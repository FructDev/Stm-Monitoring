import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Umbral de curtailment: debe coincidir EXACTAMENTE con el del driver Rust
// (main.rs: curtailment_limit_mw < 119.0). Por debajo de este valor hay limitación SENI.
export const CURTAILMENT_THRESHOLD_MW = 119;

// Hay curtailment si el límite es positivo y está por debajo del umbral (0 = sin límite).
const computeIsCurtailment = (val: number) => val > 0 && val < CURTAILMENT_THRESHOLD_MW;

interface CurtailmentState {
    limitMW: number;
    setLimitMW: (val: number) => void;
    // Computed property
    isManualCurtailment: boolean;
}

export const useCurtailment = create<CurtailmentState>()(
    persist(
        (set) => ({
            limitMW: 120, // Por defecto, sin límite (Capacidad de la planta ej. 120MW)
            isManualCurtailment: false, // se actualizará en setLimitMW
            setLimitMW: (val) => set({
                limitMW: val,
                isManualCurtailment: computeIsCurtailment(val)
            }),
        }),
        {
            name: 'curtailment-storage',
            // Hidratar la propiedad computada al inicio
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state.isManualCurtailment = computeIsCurtailment(state.limitMW);
                }
            },
        }
    )
);
