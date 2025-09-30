import {useState} from "react"

import {ContractAbi} from "@shared/abi"

import {ContractInfoData} from "../sandbox-actions-types"
import {DeployState} from "../../../../../providers/sandbox/methods"

interface UseContractDataReturn {
  readonly contractAbi: ContractAbi | undefined
  readonly contractInfo: ContractInfoData | undefined
  readonly deployState: DeployState | null
  readonly setContractAbi: (abi: ContractAbi | undefined) => void
  readonly setContractInfo: (info: ContractInfoData | undefined) => void
  readonly setDeployState: (state: DeployState | null) => void
}

export function useContractData(): UseContractDataReturn {
  const [contractAbi, setContractAbi] = useState<ContractAbi | undefined>()
  const [contractInfo, setContractInfo] = useState<ContractInfoData | undefined>()
  const [deployState, setDeployState] = useState<DeployState | null>(null)

  return {
    contractAbi,
    contractInfo,
    deployState,
    setContractAbi,
    setContractInfo,
    setDeployState,
  }
}
