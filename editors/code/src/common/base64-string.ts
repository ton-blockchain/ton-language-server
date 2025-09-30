declare const base64Brand: unique symbol
export type Base64String = string & {readonly [base64Brand]: true}
