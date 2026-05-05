//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as vscode from "vscode"

import {
    createTonAddressExplorerUrl,
    findTonAddressMatches,
    normalizeTonExplorer,
    type TonAddressMatch,
} from "./ActonTonAddress"

class TonAddressTerminalLink extends vscode.TerminalLink {
    public constructor(private readonly match: TonAddressMatch) {
        super(match.startIndex, match.length, "Open TON address in explorer")
    }

    public get address(): string {
        return this.match.address
    }

    public get isTestnet(): boolean {
        return this.match.isTestnet
    }
}

class ActonTonAddressTerminalLinkProvider
    implements vscode.TerminalLinkProvider<TonAddressTerminalLink>
{
    public provideTerminalLinks(
        context: vscode.TerminalLinkContext,
        _token: vscode.CancellationToken,
    ): TonAddressTerminalLink[] {
        return findTonAddressMatches(context.line).map(match => new TonAddressTerminalLink(match))
    }

    public async handleTerminalLink(link: TonAddressTerminalLink): Promise<void> {
        const explorer = normalizeTonExplorer(
            vscode.workspace.getConfiguration("ton").get<string>("acton.explorer"),
        )
        const url = createTonAddressExplorerUrl(link.address, explorer, link.isTestnet)
        await vscode.env.openExternal(vscode.Uri.parse(url))
    }
}

export function registerActonTerminalLinks(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.window.registerTerminalLinkProvider(new ActonTonAddressTerminalLinkProvider()),
    )
}
