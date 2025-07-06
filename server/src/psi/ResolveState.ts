export class ResolveState {
    private values: Map<string, string> = new Map()

    public get(key: string): string | null {
        return this.values.get(key) ?? null
    }

    public withValue(key: string, value: string): ResolveState {
        const state = new ResolveState()
        state.values = this.values.set(key, value)
        return state
    }
}
