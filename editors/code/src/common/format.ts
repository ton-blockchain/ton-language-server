export function formatAddress(address: string): string {
    if (address.length <= 12) {
        return address
    }
    return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
}
