declare const hexBrand: unique symbol
export type HexString = string & {readonly [hexBrand]: true}
