//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {createConnection, ProposedFeatures} from "vscode-languageserver/node"

export const connection = createConnection(ProposedFeatures.all)
