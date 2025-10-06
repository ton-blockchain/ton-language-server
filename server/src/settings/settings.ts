//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {connection} from "@server/connection"

export type FindUsagesScope = "workspace" | "everywhere"

export interface ToolchainConfig {
    readonly name: string
    readonly path: string
    readonly description?: string
}

export interface FiftSettings {
    readonly hints: {
        readonly showGasConsumption: boolean
    }
    readonly semanticHighlighting: {
        readonly enabled: boolean
    }
}

export interface TolkSettings {
    readonly stdlib: {
        readonly path: string | null
    }
    readonly toolchain: {
        readonly activeToolchain: string
        readonly toolchains: Record<string, ToolchainConfig>
        readonly showShortCommitInStatusBar: boolean
    }
    readonly findUsages: {
        readonly scope: FindUsagesScope
    }
    readonly hints: {
        readonly disable: boolean
        readonly types: boolean
        readonly parameters: boolean
        readonly showMethodId: boolean
        readonly constantValues: boolean
    }
    readonly inspections: {
        readonly disabled: readonly string[] // list of disabled inspection ids
    }
    readonly completion: {
        readonly typeAware: boolean
        readonly addImports: boolean
    }
    readonly formatter: {
        readonly useFormatter: boolean
        readonly sortImports: boolean
    }
}

export interface TlbSettings {
    readonly hints: {
        readonly disable: boolean
        readonly showConstructorTag: boolean
    }
    readonly inspections: {
        readonly disabled: readonly string[]
    }
}

export interface FuncSettings {
    readonly hints: {
        readonly disable: boolean
        readonly showMethodId: boolean
        readonly showImplicitConstantType: boolean
    }
    readonly inspections: {
        readonly disabled: readonly string[] // list of disabled inspection ids
    }
}

export interface ServerSettings {
    readonly tolk: TolkSettings
    readonly func: FuncSettings
    readonly fift: FiftSettings
    readonly tlb: TlbSettings
}

const tolkDefaultSettings: TolkSettings = {
    stdlib: {
        path: null,
    },
    toolchain: {
        activeToolchain: "auto",
        toolchains: {
            auto: {
                name: "Auto-detected",
                path: "",
                description: "Automatically detect Tolk compiler in node_modules",
            },
        },
        showShortCommitInStatusBar: false,
    },
    findUsages: {
        scope: "workspace",
    },
    hints: {
        disable: false,
        types: true,
        parameters: true,
        showMethodId: true,
        constantValues: true,
    },
    inspections: {
        disabled: [], // no disabled inspections by default
    },
    completion: {
        typeAware: true,
        addImports: true,
    },
    formatter: {
        useFormatter: true,
        sortImports: true,
    },
}

const defaultSettings: ServerSettings = {
    tolk: tolkDefaultSettings,
    func: {
        hints: {
            disable: false,
            showMethodId: true,
            showImplicitConstantType: true,
        },
        inspections: {
            disabled: [], // no disabled inspections by default
        },
    },
    fift: {
        hints: {
            showGasConsumption: true,
        },
        semanticHighlighting: {
            enabled: true,
        },
    },
    tlb: {
        hints: {
            disable: false,
            showConstructorTag: true,
        },
        inspections: {
            disabled: [], // no disabled inspections by default
        },
    },
}

const documentSettings: Map<string, ServerSettings> = new Map()

function mergeSettings(vsSettings: Partial<ServerSettings>): ServerSettings {
    return {
        tolk: {
            stdlib: {
                path: vsSettings.tolk?.stdlib.path ?? defaultSettings.tolk.stdlib.path,
            },
            toolchain: {
                activeToolchain:
                    vsSettings.tolk?.toolchain.activeToolchain ??
                    defaultSettings.tolk.toolchain.activeToolchain,
                toolchains:
                    vsSettings.tolk?.toolchain.toolchains ??
                    defaultSettings.tolk.toolchain.toolchains,
                showShortCommitInStatusBar:
                    vsSettings.tolk?.toolchain.showShortCommitInStatusBar ??
                    defaultSettings.tolk.toolchain.showShortCommitInStatusBar,
            },
            findUsages: {
                scope: vsSettings.tolk?.findUsages.scope ?? defaultSettings.tolk.findUsages.scope,
            },
            hints: {
                disable: vsSettings.tolk?.hints.disable ?? defaultSettings.tolk.hints.disable,
                types: vsSettings.tolk?.hints.types ?? defaultSettings.tolk.hints.types,
                parameters:
                    vsSettings.tolk?.hints.parameters ?? defaultSettings.tolk.hints.parameters,
                showMethodId:
                    vsSettings.tolk?.hints.showMethodId ?? defaultSettings.tolk.hints.showMethodId,
                constantValues:
                    vsSettings.tolk?.hints.constantValues ??
                    defaultSettings.tolk.hints.constantValues,
            },
            inspections: {
                disabled:
                    vsSettings.tolk?.inspections.disabled ??
                    defaultSettings.tolk.inspections.disabled,
            },
            completion: {
                typeAware:
                    vsSettings.tolk?.completion.typeAware ??
                    defaultSettings.tolk.completion.typeAware,
                addImports:
                    vsSettings.tolk?.completion.addImports ??
                    defaultSettings.tolk.completion.addImports,
            },
            formatter: {
                useFormatter:
                    vsSettings.tolk?.formatter.useFormatter ??
                    defaultSettings.tolk.formatter.useFormatter,
                sortImports:
                    vsSettings.tolk?.formatter.sortImports ??
                    defaultSettings.tolk.formatter.sortImports,
            },
        },
        func: {
            hints: {
                disable: vsSettings.func?.hints.disable ?? defaultSettings.func.hints.disable,
                showMethodId:
                    vsSettings.func?.hints.showMethodId ?? defaultSettings.func.hints.showMethodId,
                showImplicitConstantType:
                    vsSettings.func?.hints.showImplicitConstantType ??
                    defaultSettings.func.hints.showImplicitConstantType,
            },
            inspections: {
                disabled:
                    vsSettings.func?.inspections.disabled ??
                    defaultSettings.func.inspections.disabled,
            },
        },
        fift: {
            hints: {
                showGasConsumption:
                    vsSettings.fift?.hints.showGasConsumption ??
                    defaultSettings.fift.hints.showGasConsumption,
            },
            semanticHighlighting: {
                enabled:
                    vsSettings.fift?.semanticHighlighting.enabled ??
                    defaultSettings.fift.semanticHighlighting.enabled,
            },
        },
        tlb: {
            hints: {
                disable: vsSettings.tlb?.hints.disable ?? defaultSettings.tlb.hints.disable,
                showConstructorTag:
                    vsSettings.tlb?.hints.showConstructorTag ??
                    defaultSettings.tlb.hints.showConstructorTag,
            },
            inspections: {
                disabled:
                    vsSettings.tlb?.inspections.disabled ??
                    defaultSettings.tlb.inspections.disabled,
            },
        },
    }
}

export async function getDocumentSettings(resource: string): Promise<ServerSettings> {
    let vsCodeSettings = documentSettings.get(resource)
    if (!vsCodeSettings) {
        vsCodeSettings = (await connection.workspace.getConfiguration({
            scopeUri: resource,
            section: "ton",
        })) as ServerSettings | undefined
        if (vsCodeSettings) {
            documentSettings.set(resource, vsCodeSettings)
        }
    }
    if (!vsCodeSettings) {
        return defaultSettings
    }

    return mergeSettings(vsCodeSettings)
}

export function clearDocumentSettings(): void {
    documentSettings.clear()
}
