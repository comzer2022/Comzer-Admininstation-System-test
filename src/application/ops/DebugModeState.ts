export class DebugModeState {
    private enabled = false;
    isEnabled(): boolean {
        return this.enabled;
    }
    set(enabled: boolean): void {
        this.enabled = enabled;
    }
}
