export interface CompletionItemAdditionalInformation {
    readonly name: string | undefined
    readonly fileUri: string | undefined
    readonly elementFileUri: string | undefined
    readonly language: "tolk" | "func" | undefined
}
