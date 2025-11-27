import * as lsp from "vscode-languageserver"

import {connection} from "@server/connection"

export const showErrorMessage = (msg: string): void => {
    void connection.sendNotification(lsp.ShowMessageNotification.type, {
        type: lsp.MessageType.Error,
        message: msg,
    })
}
