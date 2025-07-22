const POLYNOMIAL = -306_674_912

let crc32_table: Int32Array | undefined = undefined

export function crc32(str: string, crc: number = 0xff_ff_ff_ff): number {
    const bytes = Buffer.from(str)
    if (crc32_table === undefined) {
        calcTable()
    }
    const table = crc32_table ?? new Int32Array(crc)
    for (const byte of bytes) {
        crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ -1) >>> 0
}

function calcTable(): void {
    crc32_table = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
        let r = i
        for (let bit = 8; bit > 0; --bit) r = r & 1 ? (r >>> 1) ^ POLYNOMIAL : r >>> 1
        crc32_table[i] = r
    }
}
