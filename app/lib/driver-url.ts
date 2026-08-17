const DEFAULT_DRIVER_BASE_URL = 'http://127.0.0.1:3030';

export const DRIVER_BASE_URL = (
    process.env.SCADA_DRIVER_URL?.trim() || DEFAULT_DRIVER_BASE_URL
).replace(/\/+$/, '');

export function driverUrl(pathname: string): string {
    return `${DRIVER_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}
