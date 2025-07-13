import {File} from "@server/psi/File"

export interface CompletionItemAdditionalInformation {
    readonly name: string | undefined
    readonly file: File | undefined
    readonly elementFile: File | undefined
    readonly language: "tolk" | "func" | undefined
}
