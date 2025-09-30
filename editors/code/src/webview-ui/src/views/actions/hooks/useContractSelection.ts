import {useState} from "react"

import {DeployedContract} from "../../../../../common/types/contract"

interface UseContractSelectionReturn {
  readonly contracts: DeployedContract[]
  readonly selectedContract: string
  readonly setContracts: (contracts: DeployedContract[]) => void
  readonly setSelectedContract: (address: string) => void
}

export function useContractSelection(): UseContractSelectionReturn {
  const [contracts, setContracts] = useState<DeployedContract[]>([])
  const [selectedContract, setSelectedContract] = useState<string>("")

  return {
    contracts,
    selectedContract,
    setContracts,
    setSelectedContract,
  }
}
