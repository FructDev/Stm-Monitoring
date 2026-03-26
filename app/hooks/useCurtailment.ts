import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CurtailmentState {
    limitMW: number;
    setLimitMW: (val: number) => void;
    // Computed property
    isManualCurtailment: boolean;
}

export const useCurtailment = create<CurtailmentState>()(
    persist(
        (set, get) => ({
            limitMW: 120, // Por defecto, sin límite (Capacidad de la planta ej. 120MW)
            isManualCurtailment: false, // se actualizará en setLimitMW
            setLimitMW: (val) => set({ 
                limitMW: val, 
                isManualCurtailment: val < 120 
            }),
        }),
        {
            name: 'curtailment-storage',
            // Opcional: hidratar la propiedad computada al inicio
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state.isManualCurtailment = state.limitMW < 120;
                }
            },
        }
    )
);
