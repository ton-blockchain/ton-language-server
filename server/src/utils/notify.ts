import * as lsp from "vscode-languageserver"

import {connection} from "@server/connection"

export const showErrorMessage = (msg: string): void => {
    void connection.sendNotification(lsp.ShowMessageNotification.type, {
        type: lsp.MessageType.Error,
        message: msg,
    })
}

export const troubleshootingLink = (section?: string): string => {
    const troubleshootingDocsLink =
        "https://github.com/ton-blockchain/ton-language-server/blob/main/docs/manual/troubleshooting.md"

    if (section == undefined) {
        return `${troubleshootingDocsLink}#${section}`
    }

    return troubleshootingDocsLink
}
