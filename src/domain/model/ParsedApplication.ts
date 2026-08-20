export type CompanionEntry = string | {
    mcid: string;
};
export interface ParsedApplication {
    mcid?: string;
    nation?: string;
    purpose?: string;
    start_datetime?: string;
    end_datetime?: string;
    period?: string;
    companions?: CompanionEntry[];
    joiners?: string[];
    joinerDiscordIds?: string[];
    [key: string]: unknown;
}
export interface InspectionResult {
    approved: boolean;
    content: string | ParsedApplication;
    parsed?: ParsedApplication;
}
