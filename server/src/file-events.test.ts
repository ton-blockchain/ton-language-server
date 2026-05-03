import {RecentFileEventTracker} from "./file-events"

describe("RecentFileEventTracker", () => {
    it("skips only immediate duplicate file events", () => {
        let now = 1000
        const tracker = new RecentFileEventTracker(1000, () => now)

        tracker.mark("file:///main.tolk")
        now = 1500
        expect(tracker.shouldSkipAndRemove("file:///main.tolk")).toBe(true)
        expect(tracker.shouldSkipAndRemove("file:///main.tolk")).toBe(false)
    })

    it("does not skip stale external file events", () => {
        let now = 1000
        const tracker = new RecentFileEventTracker(1000, () => now)

        tracker.mark("file:///main.tolk")
        now = 2501
        expect(tracker.shouldSkipAndRemove("file:///main.tolk")).toBe(false)
    })
})
