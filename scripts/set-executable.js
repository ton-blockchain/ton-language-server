const fs = require("fs")
const path = require("path")

const filePath = process.argv[2]
if (!filePath) {
    console.error("Error: No file path provided.")
    process.exit(1)
}

const absoluteFilePath = path.resolve(filePath)
if (!fs.existsSync(absoluteFilePath)) {
    console.error(`Error: File not found at ${absoluteFilePath}`)
    process.exit(1)
}

try {
    const stats = fs.statSync(absoluteFilePath)
    fs.chmodSync(absoluteFilePath, stats.mode | 0o111)
    console.log(`Successfully set execute permission for ${absoluteFilePath}`)
} catch (err) {
    console.error(`Error setting execute permission for ${absoluteFilePath}:`, err)
    process.exit(1)
}
