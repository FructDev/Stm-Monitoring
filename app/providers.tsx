// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';

export default function Providers({ children }: { children: React.ReactNode }) {
    // Creamos el cliente una sola vez
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                // Por defecto, los datos se consideran "viejos" tras 0 segundos (siempre refrescar)
                staleTime: 0,
                // Reintentar si falla la red
                retry: 3,
                // Refrescar ventana al enfocar (bueno para dashboards)
                refetchOnWindowFocus: true,
            },
        },
    }));

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            <Toaster richColors position="top-right" expand={true} closeButton={true} visibleToasts={2} />
        </QueryClientProvider>
    );
}