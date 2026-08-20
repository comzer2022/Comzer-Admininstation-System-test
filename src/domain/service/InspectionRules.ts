import type { ParsedApplication } from '../model/ParsedApplication.js';
const MAX_PERIOD_HOURS = 24 * 31;
export function isPeriodTooLong(startDatetime: string | undefined, endDatetime: string | undefined): boolean {
    const start = new Date(startDatetime ?? '');
    const end = new Date(endDatetime ?? '');
    const periodHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return periodHours > MAX_PERIOD_HOURS;
}
export function hasRequiredFields(parsed: ParsedApplication): boolean {
    return Boolean(parsed.mcid && parsed.nation && parsed.purpose && parsed.start_datetime && parsed.end_datetime);
}
