import React from "react"
import styles from "./SendMessage.module.css"
import {Cell, loadShardAccount} from "@ton/core"

interface ContractInfoData {
    readonly account: string
}

interface Props {
    readonly info: ContractInfoData | undefined
}

export const ContractInfo: React.FC<Props> = ({info}) => {
    if (!info) return null
    console.log("info:", info)
    const account = loadShardAccount(Cell.fromHex(info.account).beginParse())

    return (
        <div className={styles.container}>
            <div className={styles.formGroup}>
                Balance: {account.account?.storage.balance.coins.toString() ?? "unknown"}
            </div>
        </div>
    )
}
