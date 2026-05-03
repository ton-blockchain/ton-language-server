export class RecentFileEventTracker {
    private readonly processedFiles: Map<string, number> = new Map()

    public constructor(
        private readonly eventWindowMs: number,
        private readonly now: () => number = () => Date.now(),
    ) {}

    public mark(uri: string): void {
        this.processedFiles.set(uri, this.now())
    }

    public shouldSkipAndRemove(uri: string): boolean {
        const processedAt = this.processedFiles.get(uri)
        if (processedAt === undefined) {
            return false
        }

        this.processedFiles.delete(uri)
        return this.now() - processedAt <= this.eventWindowMs
    }
}
