import {connection} from "@server/connection"
import * as lsp from "vscode-languageserver"
import {ServerSettings} from "@server/settings/settings"
import {tolkStdlibSearchPaths} from "@server/languages/tolk/toolchain/toolchain"
import {existsVFS, globalVFS} from "@server/vfs/files-adapter"
import {filePathToUri} from "@server/files"

export const showErrorMessage = (msg: string): void => {
    void connection.sendNotification(lsp.ShowMessageNotification.type, {
        type: lsp.MessageType.Error,
        message: msg,
    })
}

export async function findTolkStdlib(
    settings: ServerSettings,
    rootDir: string,
): Promise<string | null> {
    if (settings.tolk.stdlib.path !== null && settings.tolk.stdlib.path.length > 0) {
        return settings.tolk.stdlib.path
    }

    const tolkStdlibEnv = process.env["TOLK_STDLIB"]

    const searchDirs = [
        `${rootDir}/node_modules/@ton/tolk-js/dist/tolk-stdlib`,
        `${rootDir}/stdlib`,
        `${rootDir}/tolk-stdlib`,
        ...(tolkStdlibEnv ? [tolkStdlibEnv] : []),
        ...tolkStdlibSearchPaths(),
    ]

    const testStdlibOath = process.env["TEST_TOLK_STDLIB_PATH"]
    if (testStdlibOath) {
        searchDirs.unshift(testStdlibOath)
    }

    async function findDirectory(): Promise<string | null> {
        for (const searchDir of searchDirs) {
            if (await existsVFS(globalVFS, filePathToUri(searchDir))) {
                return searchDir
            }
        }

        return null
    }

    const stdlibPath = await findDirectory()

    if (stdlibPath === null) {
        console.error(
            "Tolk standard library not found! Searched in:\n",
            searchDirs.map(dir => `- ${dir}`).join("\n"),
        )

        showErrorMessage(
            "Tolk standard library is missing! Try installing dependencies with `yarn/npm install` or specify `tolk.stdlib.path` in settings",
        )
        return null
    }

    console.info(`Using Tolk Standard library from ${stdlibPath}`)
    return stdlibPath
}
