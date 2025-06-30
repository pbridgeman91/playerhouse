"use client"

import { useState, useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  ExitIcon,
  PlayIcon,
  DownloadIcon,
  PersonIcon,
} from "@radix-ui/react-icons"
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  addressToEmptyAccount,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { toECDSASigner } from "@zerodev/permissions/signers"
import {
  toPermissionValidator,
  serializePermissionAccount,
  deserializePermissionAccount,
  type ModularSigner,
} from "@zerodev/permissions"
import { toSudoPolicy } from "@zerodev/permissions/policies"
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants"

import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useFundWallet } from "@privy-io/react-auth"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeEventLog,
  erc20Abi,
  parseAbiItem,
  getAddress,
  hexToBigInt,
  toHex,
} from "viem"
import { arbitrumSepolia, arbitrum, baseSepolia, base } from "viem/chains"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import LandingPage from "./componets/landing-page"
import AccountDetailsModal from "./componets/AccountDetailsModal"
import { CirclePaymasterOfficial } from "../lib/circle-paymaster-official"
import FundingButton from "./componets/FundingButton"
import PlayerGameSelection from "./componets/player-game-selection"

// Contract addresses and configuration
const SLOT_ADDR = "0x865208afd1CFE5bf85B8552b73DCF78fdbFc7b83"
const USDC_ADDR = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"

// Updated ABI for single-transaction approach
export const SLOT_ABI = [
  {
    name: "spin",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "secret", type: "bytes32" },
      { name: "bet", type: "uint256" },
      { name: "numLines", type: "uint8" },
    ],
    outputs: [],
  },
]

const SPIN_EVT = parseAbiItem(
  "event SpinResult(address indexed player,uint256 totWin,uint8[5][3] pattern,bool freespin,bool bonus,uint8 numFreespin,uint256 bonusPrize,uint8[] bonusPrizeIndexes)",
)

// Network configuration
const NETWORKS = {
  arbitrum: {
    chain: arbitrum,
    publicRpc: "https://arb1.arbitrum.io/rpc",
    bundlerRpc: "https://rpc.zerodev.app/api/v3/7da0dc73-0b2f-4380-a38b-f6dd3a6430d1/chain/42161",
    slotAddr: "0xeC3Ad304186235E68CF7Ee88c7da258a87AbF0B8",
    usdcAddr: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    supportsCirclePaymaster: true,
  },
  arbitrumSepolia: {
    chain: arbitrumSepolia,
    publicRpc: "https://sepolia-rollup.arbitrum.io/rpc",
    bundlerRpc: "https://rpc.zerodev.app/api/v3/7da0dc73-0b2f-4380-a38b-f6dd3a6430d1/chain/421614",
    slotAddr: "0x9Dc3e731cfa840c83253b4e16155E0b8a74399ab",
    usdcAddr: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    supportsCirclePaymaster: true,
  }, 
 /* base: {
    chain: base,
    publicRpc: "https://sepolia.base.org",
    bundlerRpc: "https://rpc.zerodev.app/api/v3/7da0dc73-0b2f-4380-a38b-f6dd3a6430d1/chain/84532",
    slotAddr: "0xa446E73bD03Ec992b305a91140FdE6aC61c85C96",
    usdcAddr: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    supportsCirclePaymaster: true,
  }, 
  baseSepolia: {
    chain: baseSepolia,
    publicRpc: "https://sepolia.base.org",
    bundlerRpc: "https://rpc.zerodev.app/api/v3/7da0dc73-0b2f-4380-a38b-f6dd3a6430d1/chain/84532",
    slotAddr: "0xa446E73bD03Ec992b305a91140FdE6aC61c85C96",
    usdcAddr: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    supportsCirclePaymaster: true,
  }, */

} 



// Generate cryptographically secure random bytes for secrets
const generateSecret = (): `0x${string}` => {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  return toHex(randomBytes)
}

type ModalType = "success" | "account" | "networkSwitch"
type NetworkKey = keyof typeof NETWORKS
type WalletType = "privy" | "metamask" | "unknown"

// Network Switch Modal Component
function NetworkSwitchModal({
  isOpen,
  onClose,
  onSwitchNetwork,
  targetNetwork,
  currentWalletType,
}: {
  isOpen: boolean
  onClose: () => void
  onSwitchNetwork: () => void
  targetNetwork: NetworkKey
  currentWalletType: WalletType
}) {
  if (!isOpen) return null

  const networkNames = {
   arbitrumSepolia: "Arbitrum Sepolia",
    arbitrum: "Arbitrum",
    baseSepolia: "Base Sepolia",
    base: "Base Mainnet",
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[300] p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.4 }}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
                <span className="text-2xl">🔄</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Switch Network</h3>
                <p className="text-gray-400 text-sm mt-1">
                  {currentWalletType === "metamask"
                    ? "Please switch your MetaMask to the correct network"
                    : "Network change required"}
                </p>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="text-center">
                <p className="text-gray-400 text-sm mb-2">Switch to:</p>
                <p className="text-white font-semibold text-lg">{networkNames[targetNetwork]}</p>
              </div>

              {currentWalletType === "metamask" && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-amber-400 text-sm">
                    <strong>MetaMask Users:</strong> You'll need to approve the network switch in your MetaMask
                    extension.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl py-3 font-medium text-white transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={onSwitchNetwork}
                className="flex-1 bg-white hover:bg-zinc-100 text-black rounded-2xl py-3 font-medium transition-all duration-200"
              >
                Switch Network
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  // --- State ---
  const [accountAddress, setAccountAddress] = useState("")
  const [balance, setBalance] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<ModalType>("account")
  const [copied, setCopied] = useState(false)
  const [showWalletDropdown, setShowWalletDropdown] = useState(false)
  const [isAccountDeployed, setIsAccountDeployed] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [currentNetwork, setCurrentNetwork] = useState<NetworkKey>("arbitrum")
  const [networkMismatch, setNetworkMismatch] = useState(false)
  const [showNetworkPrompt, setShowNetworkPrompt] = useState(false)

  // Wallet type tracking
  const [currentWalletType, setCurrentWalletType] = useState<WalletType>("unknown")
  const [pendingNetworkSwitch, setPendingNetworkSwitch] = useState<NetworkKey | null>(null)

  // Paymaster state
  const [sponsorPaymaster, setSponsorPaymaster] = useState<any>(null)
  const [circlePaymaster, setCirclePaymaster] = useState<CirclePaymasterOfficial | null>(null)
  const [useSponsor, setUseSponsor] = useState(true)

  // Connection status tracking
  const [connectionStatus, setConnectionStatus] = useState<"good" | "degraded" | "poor">("good")
  const [lastSpinFailed, setLastSpinFailed] = useState(false)
  const [failedSpinMessage, setFailedSpinMessage] = useState("")
  const failureCountRef = useRef(0)

  // Session Key State
  const [approval, setApproval] = useState("")
  const [sessionKey, setSessionKey] = useState<ModularSigner | null>(null)

  // Game selection
  const [selectedGame, setSelectedGame] = useState("")

  // Simplified spinning state
  const [isSpinning, setIsSpinning] = useState(false)

  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const spinIdRef = useRef(0)

  // Privy hooks
  const { login, logout, exportWallet, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { fundWallet } = useFundWallet()

  // Games configuration
  const GAMES = [
    {
      id: "zeus",
      title: "Reels of Olympia",
      description: "Divine wins await in the realm of gods",
      image: "/zeus77.jpg",
      iframe: "/zeus/index.html",
    },
    {
      id: "blackbeard",
      title: "Treasure Tides",
      description: "Uncover ancient pirate treasures",
      image: "/pirates2.jpg",
      iframe: "/pirates/index.html",
    },
  ]

  // Get current game object
  const currentGame = GAMES.find((game) => game.id === selectedGame)

  // Get current network config
  const networkConfig = NETWORKS[currentNetwork]

  // Network configuration helper
  const getNetworkVariables = () => {
    return {
      publicRpc: networkConfig.publicRpc,
      bundlerRpc: networkConfig.bundlerRpc,
      slotAddr: networkConfig.slotAddr,
      usdcAddr: networkConfig.usdcAddr,
      chain: networkConfig.chain,
      supportsCirclePaymaster: networkConfig.supportsCirclePaymaster,
    }
  }

  // Public client
  const pc = createPublicClient({
    chain: getNetworkVariables().chain,
    transport: http(getNetworkVariables().publicRpc),
  })

  // NEW: Detect wallet type and handle network mismatches
  const detectWalletType = (wallet: any): WalletType => {
    if (wallet.walletClientType === "privy") return "privy"
    if (wallet.walletClientType === "metamask" || wallet.connectorType === "injected") return "metamask"
    return "unknown"
  }

  // NEW: Check if MetaMask is on correct network
  const checkMetaMaskNetwork = async (wallet: any): Promise<boolean> => {
    if (detectWalletType(wallet) !== "metamask") return true

    try {
      const provider = await wallet.getEthereumProvider()
      const chainId = await provider.request({ method: "eth_chainId" })
      const currentChainId = Number.parseInt(chainId, 16)
      const expectedChainId = getNetworkVariables().chain.id

      console.log(`🔍 MetaMask network check: current=${currentChainId}, expected=${expectedChainId}`)
      return currentChainId === expectedChainId
    } catch (error) {
      console.error("Failed to check MetaMask network:", error)
      return false
    }
  }

  // Switch MetaMask network
  const switchMetaMaskNetwork = async (wallet: any, targetNetwork: NetworkKey) => {
    if (detectWalletType(wallet) !== "metamask") return false

    try {
      const provider = await wallet.getEthereumProvider()
      const targetChain = NETWORKS[targetNetwork].chain
      const chainIdHex = `0x${targetChain.id.toString(16)}`

      console.log(`🔄 Switching MetaMask to network: ${targetNetwork} (${chainIdHex})`)

      // Try to switch to the network
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        })
        return true
      } catch (switchError: any) {
        // If network doesn't exist, add it
        if (switchError.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: chainIdHex,
                chainName: targetChain.name,
                nativeCurrency: targetChain.nativeCurrency,
                rpcUrls: [targetChain.rpcUrls.default.http[0]],
                blockExplorerUrls: targetChain.blockExplorers?.default ? [targetChain.blockExplorers.default.url] : [],
              },
            ],
          })
          return true
        }
        throw switchError
      }
    } catch (error) {
      console.error("Failed to switch MetaMask network:", error)
      return false
    }
  }

  // Load saved network preference
  useEffect(() => {
    const savedNetwork = localStorage.getItem("playerhouse-network") as NetworkKey
    console.log("📱 Loading saved network preference:", savedNetwork)
    if (savedNetwork && NETWORKS[savedNetwork]) {
      console.log("🌐 Setting network to", savedNetwork, "from saved preference")
      setCurrentNetwork(savedNetwork)
    }
  }, [])

  // Handle game selection
  const handleGameSelect = (gameId: string) => {
    if (!authenticated) {
      login()
    } else {
      setSelectedGame(gameId)
    }
  }

  // Handle back to menu
  const handleBackToMenu = () => {
    setSelectedGame("")
    setIsSpinning(false)
  }

  // Check if smart account is deployed
  const checkAccountDeployment = async (address: string) => {
    try {
      const code = await pc.getBytecode({ address: address as `0x${string}` })
      return code && code !== "0x"
    } catch {
      return false
    }
  }

  // Create paymaster clients
  const createPaymasterClients = () => {
    const { bundlerRpc, chain, usdcAddr, supportsCirclePaymaster } = getNetworkVariables()

    // Sponsor paymaster (ZeroDev)
    const sponsorPaymasterClient = createZeroDevPaymasterClient({
      chain,
      transport: http(bundlerRpc),
    })

    // Circle Paymaster (only for supported networks)
    let circlePaymasterClient: CirclePaymasterOfficial | null = null
    if (supportsCirclePaymaster) {
      circlePaymasterClient = new CirclePaymasterOfficial({
        chain,
        usdcAddress: usdcAddr,
        client: pc,
      })
    }

    return { sponsorPaymasterClient, circlePaymasterClient }
  }

  // Create kernel client
  const createNetworkSpecificKernelClient = (
    sessionKeyAccount: any,
    useSponsored = false,
    circlePaymasterData?: any,
  ) => {
    const { bundlerRpc, chain } = getNetworkVariables()

    if (useSponsored && sponsorPaymaster) {
      return createKernelAccountClient({
        account: sessionKeyAccount,
        chain,
        bundlerTransport: http(bundlerRpc),
        client: pc,
        paymaster: {
          getPaymasterData: async (userOperation) => {
            try {
              return await sponsorPaymaster.sponsorUserOperation({ userOperation })
            } catch (error) {
              console.log("Sponsor paymaster failed, falling back to no paymaster")
              return {} as any
            }
          },
        },
      })
    } else if (circlePaymasterData) {
      return createKernelAccountClient({
        account: sessionKeyAccount,
        chain,
        bundlerTransport: http(bundlerRpc),
        client: pc,
        paymaster: {
          getPaymasterData: async () => circlePaymasterData,
        },
        userOperation: {
          estimateFeesPerGas: async () => {
            const { standard: fees } = await fetch(`https://public.pimlico.io/v2/${chain.id}/rpc`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                method: "pimlico_getUserOperationGasPrice",
                params: [],
                id: 1,
              }),
            })
              .then((res) => res.json())
              .then((data) => data.result)

            const maxFeePerGas = hexToBigInt(fees.maxFeePerGas)
            const maxPriorityFeePerGas = hexToBigInt(fees.maxPriorityFeePerGas)
            return { maxFeePerGas, maxPriorityFeePerGas }
          },
        },
      })
    } else {
      return createKernelAccountClient({
        account: sessionKeyAccount,
        chain,
        bundlerTransport: http(bundlerRpc),
        client: pc,
      })
    }
  }

  // Enhanced smart account setup with wallet type detection
  useEffect(() => {
    const setupSmartAccountWithSessionKey = async () => {
      try {
        setIsSettingUp(true)
        setSetupError(null)

        // Reset state
        setAccountAddress("")
        setApproval("")
        setSessionKey(null)
        setIsAccountDeployed(false)
        setSponsorPaymaster(null)
        setCirclePaymaster(null)
        setUseSponsor(true)

        if (!wallets || wallets.length === 0) {
          console.log("⏳ Waiting for wallets to be available...")
          return
        }

        // Prioritize wallet selection based on type
        let selectedWallet = null

        // First, try to find Privy email wallet (most reliable)
        const privyWallet = wallets.find((w) => w.walletClientType === "privy")
        if (privyWallet) {
          selectedWallet = privyWallet
          setCurrentWalletType("privy")
          console.log("🔧 Using Privy email wallet (preferred)")
        } else {
          // Fallback to MetaMask or other injected wallets
          const metamaskWallet = wallets.find(
            (w) => w.walletClientType === "metamask" || w.connectorType === "injected",
          )
          if (metamaskWallet) {
            selectedWallet = metamaskWallet
            setCurrentWalletType("metamask")
            console.log("🦊 Using MetaMask wallet")

            // Check if MetaMask is on correct network
            const isCorrectNetwork = await checkMetaMaskNetwork(metamaskWallet)
            if (!isCorrectNetwork) {
              console.log("⚠️ MetaMask is on wrong network, prompting switch...")
              setPendingNetworkSwitch(currentNetwork)
              setModalType("networkSwitch")
              setShowModal(true)
              setIsSettingUp(false)
              return
            }
          } else {
            // Use any available wallet as fallback
            selectedWallet = wallets[0]
            setCurrentWalletType("unknown")
            console.log("❓ Using unknown wallet type:", selectedWallet.walletClientType)
          }
        }

        if (!selectedWallet) {
          console.log("❌ No suitable wallet found")
          setSetupError("No wallet available. Please try reconnecting.")
          setIsSettingUp(false)
          return
        }

        console.log(`🔧 Setting up ${currentNetwork} integration...`)
        console.log("📱 Using wallet:", selectedWallet.walletClientType, selectedWallet.address)

        // Get provider with error handling for different wallet types
        let provider
        try {
          provider = await selectedWallet.getEthereumProvider()
        } catch (providerError) {
          console.error("❌ Failed to get provider:", providerError)
          setSetupError(`Failed to connect to ${currentWalletType} wallet provider`)
          setIsSettingUp(false)
          return
        }

        // Ensure provider is ready (more important for MetaMask)
        if (currentWalletType === "metamask") {
          try {
            await provider.request({ method: "eth_requestAccounts" })
          } catch (accountError) {
            console.log("⚠️ eth_requestAccounts failed for MetaMask:", accountError.message)
            setSetupError("MetaMask connection failed. Please unlock MetaMask and try again.")
            setIsSettingUp(false)
            return
          }
        }

        // Create ECDSA validator
        const ecdsaValidator = await signerToEcdsaValidator(pc, {
          signer: provider,
          entryPoint: getEntryPoint("0.7"),
          kernelVersion: KERNEL_V3_1,
        })

        // Create smart account
        const smartAccount = await createKernelAccount(pc, {
          entryPoint: getEntryPoint("0.7"),
          kernelVersion: KERNEL_V3_1,
          plugins: { sudo: ecdsaValidator },
        })

        console.log("📍 Smart account address:", smartAccount.address)

        // Check deployment status
        const deployed = await checkAccountDeployment(smartAccount.address)
        setIsAccountDeployed(deployed)
        console.log("🏠 Account deployed:", deployed)

        // Create paymaster clients
        const { sponsorPaymasterClient, circlePaymasterClient } = createPaymasterClients()
        setSponsorPaymaster(sponsorPaymasterClient)
        setCirclePaymaster(circlePaymasterClient)

        // Generate session key
        const sessionPrivKey = generatePrivateKey()
        const sessionSigner = await toECDSASigner({
          signer: privateKeyToAccount(sessionPrivKey),
        })
        setSessionKey(sessionSigner)

        console.log("🔑 Session key generated:", sessionSigner.account.address)

        // Create session key account
        const emptySigner = await toECDSASigner({
          signer: addressToEmptyAccount(sessionSigner.account.address),
        })

        const permissionPlugin = await toPermissionValidator(pc, {
          signer: emptySigner,
          entryPoint: getEntryPoint("0.7"),
          kernelVersion: KERNEL_V3_1,
          policies: [toSudoPolicy({})],
        })

        const sessionKeyAccount = await createKernelAccount(pc, {
          entryPoint: getEntryPoint("0.7"),
          kernelVersion: KERNEL_V3_1,
          plugins: {
            sudo: ecdsaValidator,
            regular: permissionPlugin,
          },
        })

        // Serialize session key account
        const approvalStr = await serializePermissionAccount(sessionKeyAccount)
        setApproval(approvalStr)

        setAccountAddress(smartAccount.address)
        setIsSettingUp(false)

        console.log(`🎉 ${currentNetwork} setup complete with ${currentWalletType} wallet!`)
        if (circlePaymasterClient) {
          console.log("🔵 Circle Paymaster available for USDC gas payments")
        }
      } catch (error) {
        console.error("❌ Smart account setup failed:", error)
        setSetupError(error.message || "Failed to setup smart account")
        setIsSettingUp(false)
      }
    }

    if (authenticated) {
      const timer = setTimeout(() => {
        setupSmartAccountWithSessionKey()
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [authenticated, wallets, currentNetwork])

  // Add sponsor retry mechanism - 60 second periodic re-enable
  useEffect(() => {
    if (!sponsorPaymaster || !sessionKey || !accountAddress || !approval) {
      return
    }

    // Every 60 seconds, if sponsor is disabled, try to re-enable it
    const retryInterval = setInterval(() => {
      if (!useSponsor) {
        console.log("🔄 Re-enabling sponsor paymaster for retry...")
        setUseSponsor(true)
      }
    }, 60000) // 60 seconds

    return () => {
      clearInterval(retryInterval)
    }
  }, [sponsorPaymaster, sessionKey, accountAddress, approval, useSponsor, currentNetwork])

  //  Enhanced network change handler with MetaMask support
  const handleNetworkChange = async (networkKey: NetworkKey) => {
    if (isSettingUp) return

    console.log(`🔄 Network change requested: ${networkKey}`)

    // If using MetaMask, handle network switching
    if (currentWalletType === "metamask" && wallets.length > 0) {
      const metamaskWallet = wallets.find((w) => detectWalletType(w) === "metamask")
      if (metamaskWallet) {
        setPendingNetworkSwitch(networkKey)
        setModalType("networkSwitch")
        setShowModal(true)
        return
      }
    }

    // For Privy wallets or when MetaMask switch is complete
    console.log(`🔄 Switching to ${networkKey}, re-setting up wallet...`)
    localStorage.setItem("playerhouse-network", networkKey)
    setCurrentNetwork(networkKey)

    // Clear spinning state when switching networks
    setIsSpinning(false)

    if (authenticated) {
      setIsSettingUp(true)
    }
  }

  // Handle network switch confirmation
  const handleNetworkSwitchConfirm = async () => {
    if (!pendingNetworkSwitch) return

    setShowModal(false)

    if (currentWalletType === "metamask" && wallets.length > 0) {
      const metamaskWallet = wallets.find((w) => detectWalletType(w) === "metamask")
      if (metamaskWallet) {
        const success = await switchMetaMaskNetwork(metamaskWallet, pendingNetworkSwitch)
        if (!success) {
          setSetupError("Failed to switch MetaMask network. Please switch manually.")
          setPendingNetworkSwitch(null)
          return
        }

        // Wait a bit for MetaMask to update
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // Complete the network switch
    console.log(`🔄 Completing network switch to ${pendingNetworkSwitch}`)
    localStorage.setItem("playerhouse-network", pendingNetworkSwitch)
    setCurrentNetwork(pendingNetworkSwitch)
    setPendingNetworkSwitch(null)

    // Clear spinning state when switching networks
    setIsSpinning(false)

    if (authenticated) {
      setIsSettingUp(true)
    }
  }

  // Inject wallet into iframe
  useEffect(() => {
    if (!accountAddress || !selectedGame) return

    const injectWallet = () => {
      if (iframeRef.current?.contentWindow) {
        const message = {
          type: "wallet",
          wallet: accountAddress.toLowerCase(),
          network: currentNetwork,
          walletType: currentWalletType,
        }
        console.log("🔌 Injecting wallet:", message)
        iframeRef.current.contentWindow.postMessage(message, "*")
      }
    }

    const timeoutId = setTimeout(injectWallet, 100)
    return () => clearTimeout(timeoutId)
  }, [accountAddress, selectedGame, currentNetwork, currentWalletType])

  // Reinject on iframe load
  useEffect(() => {
    if (!iframeRef.current || !accountAddress || !selectedGame) return

    const handleIframeLoad = () => {
      console.log("🔄 Iframe loaded, injecting wallet")
      const message = {
        type: "wallet",
        wallet: accountAddress.toLowerCase(),
        network: currentNetwork,
        walletType: currentWalletType,
      }
      iframeRef.current?.contentWindow?.postMessage(message, "*")
    }

    const iframe = iframeRef.current
    iframe.addEventListener("load", handleIframeLoad)

    return () => {
      iframe.removeEventListener("load", handleIframeLoad)
    }
  }, [accountAddress, selectedGame, currentNetwork, currentWalletType])

  // Fetch USDC balance
  useEffect(() => {
    if (!accountAddress) return

    const fetchBalance = () => {
      const { usdcAddr } = getNetworkVariables()
      pc.readContract({
        address: usdcAddr as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accountAddress as `0x${string}`],
      })
        .then((bn) => setBalance(Number(bn) / 1e6))
        .catch((err) => {
          console.error("Failed to fetch balance:", err)
          setBalance(null)
        })
    }

    fetchBalance()
    const intervalId = setInterval(fetchBalance, 10000)
    return () => clearInterval(intervalId)
  }, [accountAddress, currentNetwork])

  // OPTIMIZED: Single-transaction spin handler (unchanged)
  useEffect(() => {
    if (!approval || !sessionKey || !accountAddress) return

    const onSpin = async (ev: MessageEvent) => {
      if (ev.data?.type !== "spin") return
      const id = ++spinIdRef.current

      const log = (...args: any[]) => console.debug(`[${new Date().toISOString().slice(11, 23)}]`, ...args)

      const betRaw = ev.data.bet
      const betDec = Number(betRaw)
      const lines = ev.data.payline ?? 20 // fallback to 20 if undefined
      const betU = BigInt(Math.round(betDec * 1e6))

      log(`🎰 spin #${id} — bet=${betDec} lines=${lines} (${currentNetwork}) [SINGLE-TX]`)

      // Validate bet
      if (!Number.isFinite(betDec) || betDec < 0.1 || betDec > 0.5) {
        console.warn("⚠️ Invalid bet amount. Retrying in 250ms...", { betRaw })

        setTimeout(() => {
          window.postMessage(
            {
              type: "spin",
              bet: 0.1,
              payline: 20,
            },
            "*",
          )
        }, 250)

        return
      }

      const post = (result: any) =>
        iframeRef.current?.contentWindow?.postMessage({ type: "spinResult", id, result }, "*")

      if (betDec <= 0) return post({ res: false, err: "bad-bet" })

      // Set spinning state
      setIsSpinning(true)

      try {
        // Generate secret for this spin (soft commit)
        const secret = generateSecret()
        log("🔑 Generated secret...")

        // Check account deployment
        if (!isAccountDeployed) {
          const deployed = await checkAccountDeployment(accountAddress)
          if (!deployed) {
            log("🏗️ Account not deployed, this transaction will deploy it")
          }
          setIsAccountDeployed(deployed)
        }

        // Rehydrate session key account
        const sessionKeyAccount = await deserializePermissionAccount(
          pc,
          getEntryPoint("0.7"),
          KERNEL_V3_1,
          approval,
          sessionKey,
        )

        // Check USDC balance
        const bal = await pc.readContract({
          address: getNetworkVariables().usdcAddr as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [accountAddress as `0x${string}`],
        })
        log("💰 USDC balance", bal.toString())

        // Check slot allowance
        const slotAllowance = await pc.readContract({
          address: getNetworkVariables().usdcAddr as `0x${string}`,
          abi: erc20Abi,
          functionName: "allowance",
          args: [accountAddress as `0x${string}`, getNetworkVariables().slotAddr as `0x${string}`],
        })
        log("🔓 Slot allowance", slotAllowance.toString())

        // Build calls
        const calls: any[] = []

        // Add approval if needed
        if (slotAllowance < betU) {
          calls.push({
            to: getNetworkVariables().usdcAddr as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [getNetworkVariables().slotAddr as `0x${string}`, 2n ** 256n - 1n],
            }),
          })
          log("🔓 Adding slot approval call")
        }

        // Add spin call with secret
        calls.push({
          to: getNetworkVariables().slotAddr as `0x${string}`,
          data: encodeFunctionData({
            abi: SLOT_ABI,
            functionName: "spin",
            args: [secret, betU, lines],
          }),
        })

        let userOpHash: string | null = null

        // Try sponsor paymaster first
        if (useSponsor && sponsorPaymaster) {
          try {
            log(`💰 Attempting sponsor paymaster (free gas)`)

            if (bal < betU) {
              setIsSpinning(false)
              return post({
                res: false,
                err: `Insufficient USDC for bet. Need ${Number(betU) / 1e6} USDC`,
              })
            }

            const sponsorKernelClient = createNetworkSpecificKernelClient(sessionKeyAccount, true)

            const startBlock = await pc.getBlockNumber()
            log("🔨 sending UserOp from block", startBlock, "with", calls.length, "calls (sponsor paymaster)")
            iframeRef.current?.contentWindow?.postMessage({ type: "spin:loading" }, "*")

            userOpHash = await sponsorKernelClient.sendUserOperation({
              callData: await sessionKeyAccount.encodeCalls(calls),
            })

            log("📨 userOpHash (sponsored):", userOpHash)
            log("✅ Sponsor paymaster succeeded")
          } catch (sponsorError) {
            log("⚠️ Sponsor paymaster failed:", sponsorError.message)
            setUseSponsor(false)
            userOpHash = null
          }
        }

        // Fallback to Circle Paymaster
        if (!userOpHash && circlePaymaster && getNetworkVariables().supportsCirclePaymaster) {
          log("🔵 Using Circle Paymaster (USDC gas payment)")

          try {
            // Check if we have enough USDC for bet + estimated gas
            const estimatedGasCost = 100000n // 0.1 USDC estimated gas cost
            const totalRequired = betU + estimatedGasCost

            log(`🔵 Balance check: have ${Number(bal) / 1e6} USDC, need ${Number(totalRequired) / 1e6} USDC`)

            if (bal < totalRequired) {
              setIsSpinning(false)
              return post({
                res: false,
                err: `Insufficient USDC. You have ${Number(bal) / 1e6} USDC but need ${Number(totalRequired) / 1e6} USDC (${Number(betU) / 1e6} for bet + ${Number(estimatedGasCost) / 1e6} estimated gas).`,
              })
            }

            // Get Circle Paymaster data
            const circlePaymasterData = await circlePaymaster.getPaymasterData(sessionKeyAccount)
            log("🔵 Circle Paymaster data created successfully")

            // Create kernel client with Circle Paymaster
            const circleKernelClient = createNetworkSpecificKernelClient(sessionKeyAccount, false, circlePaymasterData)

            const startBlock = await pc.getBlockNumber()
            log("🔨 sending UserOp from block", startBlock, "with", calls.length, "calls (Circle Paymaster)")

            userOpHash = await circleKernelClient.sendUserOperation({
              callData: await sessionKeyAccount.encodeCalls(calls),
            })

            log("📨 userOpHash (Circle Paymaster):", userOpHash)
            log("✅ Circle Paymaster succeeded")
          } catch (circleError) {
            log("❌ Circle Paymaster failed:", circleError.message)
            setIsSpinning(false)
            return post({ res: false, err: "Circle Paymaster failed: " + circleError.message })
          }
        }

        // If no paymaster worked
        if (!userOpHash) {
          setIsSpinning(false)
          return post({ res: false, err: "All paymaster options failed" })
        }

        // Event watching logic
        const currentBlock = await pc.getBlockNumber()
        log("🔍 Setting up event watching from block", currentBlock)

        let gotEvent = false
        const stop = pc.watchEvent({
          address: getNetworkVariables().slotAddr as `0x${string}`,
          event: SPIN_EVT,
          fromBlock: currentBlock,
          args: { player: getAddress(accountAddress) },
          onLogs: async (logs) => {
            if (!logs.length || gotEvent) return
            gotEvent = true
            stop()

            log("🎰 SpinResult event received!")

            failureCountRef.current = 0
            setConnectionStatus("good")
            setIsSpinning(false)

            const { args } = decodeEventLog({
              abi: [SPIN_EVT],
              data: logs[0].data,
              topics: logs[0].topics,
            })

            const newBal = await pc.readContract({
              address: getNetworkVariables().usdcAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [accountAddress as `0x${string}`],
            })

            post({
              res: true,
              win: args.totWin > 0n || args.bonusPrize > 0n,
              tot_win: Number(args.totWin.toString()) / 1e6,
              pattern: args.pattern,
              freespin: args.freespin,
              bonus: args.bonus,
              num_freespin: args.numFreespin,
              money: Number(newBal) / 1e6,
              bonus_prize: Number(args.bonusPrize) / 1e6,
              prize_list: JSON.stringify(args.bonusPrizeIndexes.map((i: any) => [10, 20, 40, 60, 80][Number(i)])),
              _aBonusId: args.bonus ? ["BONUS_GAME"] : [],
              bonusData: {
                prize_list: JSON.stringify(args.bonusPrizeIndexes.map((i: any) => [10, 20, 40, 60, 80][Number(i)])),
                bonus_win: Number(args.bonusPrize) / 1e6,
                money: Number(newBal) / 1e6,
              },
            })
          },
        })

        // Fallback polling
        setTimeout(async () => {
          if (gotEvent) return
          log("⏱ fallback poll starting")
          stop()

          const retries = 5
          let logs = []

          for (let i = 0; i < retries; i++) {
            logs = await pc.getLogs({
              address: getNetworkVariables().slotAddr as `0x${string}`,
              event: SPIN_EVT,
              fromBlock: currentBlock,
              args: { player: getAddress(accountAddress) },
            })

            if (logs.length) break
            log(`🔁 retrying log poll (${i + 1}/${retries})...`)
            await new Promise((res) => setTimeout(res, 2000))
          }

          if (!logs.length) {
            failureCountRef.current += 1

            if (failureCountRef.current >= 3) {
              setConnectionStatus("poor")
            } else if (failureCountRef.current >= 1) {
              setConnectionStatus("degraded")
            }

            setLastSpinFailed(true)
            setFailedSpinMessage("Transaction Error - Money Refunded")
            setIsSpinning(false)

            setTimeout(() => {
              setLastSpinFailed(false)
              setFailedSpinMessage("")
            }, 5000)

            return post({ res: false, err: "timeout" })
          }

          // Process successful result
          const { args } = decodeEventLog({
            abi: [SPIN_EVT],
            data: logs[0].data,
            topics: logs[0].topics,
          })
          log(`🏆 fallback logs: totWin=$${Number(args.totWin.toString()) / 1e6}`, args)


          failureCountRef.current = 0
          setConnectionStatus("good")
          setIsSpinning(false)

          const newBal = await pc.readContract({
            address: getNetworkVariables().usdcAddr as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [accountAddress as `0x${string}`],
          })

          post({
            res: true,
            win: args.totWin > 0n || args.bonusPrize > 0n,
            tot_win: Number(args.totWin.toString()) / 1e6,
            pattern: args.pattern,
            freespin: args.freespin,
            bonus: args.bonus,
            num_freespin: args.numFreespin,
            money: Number(newBal) / 1e6,
            bonus_prize: Number(args.bonusPrize) / 1e6,
            prize_list: JSON.stringify(args.bonusPrizeIndexes.map((i: any) => [10, 20, 40, 60, 80][Number(i)])),
            _aBonusId: args.bonus ? ["BONUS_GAME"] : [],
            bonusData: {
              prize_list: JSON.stringify(args.bonusPrizeIndexes.map((i: any) => [10, 20, 40, 60, 80][Number(i)])),
              bonus_win: Number(args.bonusPrize) / 1e6,
              money: Number(newBal) / 1e6,
            },
          })
        }, 2000)
      } catch (err: any) {
        console.error("❌ spin failed", err)

        failureCountRef.current += 1

        if (failureCountRef.current >= 3) {
          setConnectionStatus("poor")
        } else if (failureCountRef.current >= 1) {
          setConnectionStatus("degraded")
        }

        setLastSpinFailed(true)
        setFailedSpinMessage("Transaction Error - Money Refunded")
        setIsSpinning(false)

        setTimeout(() => {
          setLastSpinFailed(false)
          setFailedSpinMessage("")
        }, 5000)

        post({ res: false, err: err?.shortMessage ?? String(err) })
      }
    }

    window.addEventListener("message", onSpin)
    return () => window.removeEventListener("message", onSpin)
  }, [
    approval,
    sessionKey,
    accountAddress,
    isAccountDeployed,
    circlePaymaster,
    sponsorPaymaster,
    useSponsor,
    currentNetwork,
  ])

  // Helper functions
  const copyAddress = async () => {
    if (accountAddress) {
      await navigator.clipboard.writeText(accountAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      setShowWalletDropdown(false)
    }
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const handleDisconnect = () => {
    logout()
    setAccountAddress("")
    setApproval("")
    setSessionKey(null)
    setShowWalletDropdown(false)
    setSelectedGame("")
    setIsAccountDeployed(false)
    setSetupError(null)
    setIsSettingUp(false)
    setSponsorPaymaster(null)
    setCirclePaymaster(null)
    setUseSponsor(true)
    setIsSpinning(false)
    setCurrentWalletType("unknown")
    setPendingNetworkSwitch(null)
  }

  const handleConnectWallet = () => {
    login()
  }

  const handleAccountDetails = () => {
    setModalType("account")
    setShowModal(true)
    setShowWalletDropdown(false)
  }

  // Connection status effects
  const [flashGreen, setFlashGreen] = useState(false)
  const prevConnectionStatus = useRef<"good" | "degraded" | "poor" | null>(null)
  const prevAddress = useRef<string | null>(null)

  useEffect(() => {
    const connected = accountAddress && prevAddress.current !== accountAddress
    const recovered =
      connectionStatus === "good" && prevConnectionStatus.current && prevConnectionStatus.current !== "good"

    if (connected || recovered) {
      setFlashGreen(true)
      setTimeout(() => setFlashGreen(false), 1000)
    }

    prevConnectionStatus.current = connectionStatus
    prevAddress.current = accountAddress || null
  }, [connectionStatus, accountAddress])

  // Wallet status - updated with wallet type info
  const getWalletStatus = () => {
    if (setupError) return { text: "Setup Error", color: "text-red-400", icon: "❌" }
    if (isSettingUp) return { text: "Setting up...", color: "text-yellow-400", icon: "🔄" }
    if (!wallets || wallets.length === 0) return { text: "No wallet found", color: "text-red-400", icon: "⚠️" }
    if (!approval || !sessionKey || (!sponsorPaymaster && !circlePaymaster))
      return { text: "Configuring...", color: "text-yellow-400", icon: "⚙️" }

    const walletIcon = currentWalletType === "privy" ? "📧" : currentWalletType === "metamask" ? "🦊" : "💳"

    if (isAccountDeployed) {
      const paymentMethod = useSponsor
        ? "Sponsored Gas"
        : getNetworkVariables().supportsCirclePaymaster
          ? "USDC Gas"
          : "Manual Gas"
      return { text: `Ready (${paymentMethod})`, color: "text-green-400", icon: walletIcon }
    }
    return { text: "Ready (First tx deploys)", color: "text-blue-400", icon: walletIcon }
  }

  const walletStatus = getWalletStatus()

  // Network display names
  const getNetworkDisplayName = (networkKey: NetworkKey) => {
    const names = {
        arbitrum: "Arbitrum",
      arbitrumSepolia: "Arbitrum Sepolia",
      mainnet: "Ethereum",
      baseSepolia: "Base Sepolia",
      base: "Base",
      optimism: "Optimism",
    }
    return names[networkKey] || networkKey
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header
  className={`top-0 border-b border-[#1a1a1a] bg-[#0f0f0f]/80 backdrop-blur-lg z-[100] ${
    selectedGame ? "static" : "sticky"
  }`}
>        <div className="flex items-center justify-between max-w-7xl mx-auto px-4 sm:px-6 py-2">
          <div className="flex items-center">
            {selectedGame && (
              <button
                onClick={handleBackToMenu}
                className="mr-2 md:mr-3 md:p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors 
                text-gray-400 hover:text-white"
              >
                ← Back
              </button>
            )}
            <div className="w-[200px] h-auto bg-black rounded-lg flex items-center justify-center text-xl font-bold">
              <img src="/logonew-gray.png" alt="PlayerHouse Logo" />
            </div>
            <div className="ml-3">
              <h1 className="text-lg sm:text-xl font-semibold text-white"></h1>
              <p className="text-xs text-gray-500"></p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {authenticated && accountAddress ? (
              <div className="flex items-center">
                <div className="hidden sm:block text-right mr-3">
                  <div className="flex items-center justify-end space-x-3">
                    {/* Signal strength indicator 
                    <div className="flex items-end h-5 space-x-[3px]">
                      <div
                        className={`w-[3px] rounded-full transition-all duration-300 ${
                          flashGreen
                            ? "h-2 bg-green-400"
                            : connectionStatus === "good"
                              ? "h-2 bg-gray-500 shadow-sm"
                              : connectionStatus === "degraded"
                                ? "h-2 bg-gradient-to-t from-yellow-500 to-yellow-400"
                                : "h-2 bg-gradient-to-t from-red-500 to-red-400"
                        }`}
                      ></div>
                      <div
                        className={`w-[3px] rounded-full transition-all duration-300 ${
                          flashGreen
                            ? "h-3 bg-green-400"
                            : connectionStatus === "good"
                              ? "h-3 bg-gray-500 shadow-sm"
                              : connectionStatus === "degraded"
                                ? "h-3 bg-gradient-to-t from-yellow-500 to-yellow-400"
                                : "h-2 bg-red-400/30"
                        }`}
                      ></div>
                      <div
                        className={`w-[3px] rounded-full transition-all duration-300 ${
                          flashGreen
                            ? "h-4 bg-green-400"
                            : connectionStatus === "good"
                              ? "h-4 bg-gray-500 shadow-sm"
                              : connectionStatus === "degraded"
                                ? "h-3 bg-yellow-400/40"
                                : "h-2 bg-red-400/20"
                        }`}
                      ></div>
                      <div
                        className={`w-[3px] rounded-full transition-all duration-300 ${
                          flashGreen
                            ? "h-5 bg-green-400"
                            : connectionStatus === "good"
                              ? "h-5 bg-gray-500 shadow-sm"
                              : connectionStatus === "degraded"
                                ? "h-3 bg-yellow-400/30"
                                : "h-2 bg-red-400/20"
                        }`}
                      ></div>
                    </div>*/}
                  </div>
                </div>

                <div className="relative z-[100]">
                  <button
                    onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                    className="bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2a2a2a] rounded-xl px-3 sm:px-4 py-2 
                    transition-colors flex items-center z-[50]"
                  >
                    <div
                      className={`w-2 h-2 rounded-full mr-2 ${
                        setupError
                          ? "bg-red-400"
                          : !approval || !sessionKey
                            ? "bg-yellow-400"
                            : useSponsor
                              ? "bg-green-400"
                              : getNetworkVariables().supportsCirclePaymaster
                                ? "bg-blue-400"
                                : "bg-gray-400"
                      }`}
                    ></div>
                    <span className="font-mono text-xs sm:text-sm text-gray-200 mr-2">
                      {formatAddress(accountAddress)}
                    </span>
                    <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                  </button>

                  {showWalletDropdown && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl z-[100]">
                      <DropdownMenu.Label className="px-4 py-2 text-xs text-gray-500">
                        Smart Account (
                        {currentWalletType === "privy"
                          ? "Email"
                          : currentWalletType === "metamask"
                            ? "MetaMask"
                            : "External"}
                        )
                      </DropdownMenu.Label>

                      <div className="px-4 py-2 text-xs text-gray-400 cursor-default">
                        Gas Payment:{" "}
                        {sponsorPaymaster && circlePaymaster
                          ? useSponsor
                            ? "🟢 Sponsored"
                            : getNetworkVariables().supportsCirclePaymaster
                              ? "🔵 USDC"
                              : "⚙️ Setup Needed"
                          : "⏳ Setting up..."}
                      </div>

                      <div className="border-t border-[#2a2a2a] my-1"></div>

                      <button
                        onClick={handleAccountDetails}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#2a2a2a] hover:text-white transition-colors flex items-center space-x-3"
                      >
                        <PersonIcon className="w-4 h-4" />
                        <span>Account Details</span>
                      </button>

                      {setupError && (
                        <div className="px-4 py-2 text-xs text-red-400 cursor-default border-t border-[#2a2a2a]">
                          {setupError}
                        </div>
                      )}

                      <div className="border-t border-[#2a2a2a] my-1"></div>

                      <button
                        onClick={copyAddress}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#2a2a2a] hover:text-white transition-colors flex items-center space-x-3"
                      >
                        <CopyIcon className="w-4 h-4" />
                        <span>{copied ? "Copied!" : "Copy Address"}</span>
                      </button>

                      <a
  href={`https://${
    currentNetwork === "arbitrum"
      ? "arbiscan.io"
      : currentNetwork === "arbitrumSepolia"
      ? "sepolia.arbiscan.io"
      : currentNetwork === "base"
      ? "basescan.org"
      : currentNetwork === "baseSepolia"
      ? "sepolia.basescan.org"
      : "etherscan.io"
  }/address/${accountAddress}`}
  target="_blank"
  rel="noopener noreferrer"
  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#2a2a2a] hover:text-white 
    transition-colors flex items-center space-x-3"
  onClick={() => setShowWalletDropdown(false)}
>
  <ExternalLinkIcon className="w-4 h-4" />
  <span>View on Explorer</span>
</a>


                      {currentWalletType === "privy" && (
                        <button
                          onClick={exportWallet}
                          className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#2a2a2a] hover:text-white transition-colors flex items-center space-x-3"
                        >
                          <DownloadIcon className="w-4 h-4" />
                          <span>Export Wallet</span>
                        </button>
                      )}

                      <div className="border-t border-[#2a2a2a] my-1"></div>

                      <button
                        onClick={handleDisconnect}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors flex items-center space-x-3"
                      >
                        <ExitIcon className="w-4 h-4" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
<button
  onClick={handleConnectWallet}
  disabled={isSettingUp}
  className={`
    border border-[#2a2a2a]
    rounded-xl
    px-4 sm:px-6
    text-sm font-medium
    transition-colors
    whitespace-nowrap
    flex items-center space-x-2

    ${isSettingUp
      ? "bg-[#2a2a2a] cursor-not-allowed opacity-75"
      : "bg-[#1a1a1a] hover:bg-[#2a2a2a]"}

    ${!isSettingUp && !setupError
      ? "py-[.48rem] hover:bg-transparent border border-transparent hover:border hover:text-green-500 hover:border-green-500"    /* less vertical padding for PLAY */
      : "py-2"}   /* default padding for other states */
  `}
>
  {authenticated && isSettingUp ? (
    <>
      <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
      <span>Setting up wallet...</span>
    </>
  ) : authenticated && setupError ? (
    <>
      <span className="text-red-400">❌</span>
      <span>Setup Error - Retry</span>
    </>
  ) : (
    <span className="px-8 py-0 ">PLAY</span>
  )}
</button>

            )}
          </div>
        </div>
      </header>

      {/* Connection Status Banner */}
      {lastSpinFailed && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="bg-red-500/20 border-b border-red-500/30 px-4 py-3"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            <p className="text-red-400 text-sm font-medium">{failedSpinMessage}</p>
          </div>
        </motion.div>
      )}

      {/* Main Content */}
      <main className="flex-grow">
        {selectedGame && currentGame ? (
          <iframe
            key={selectedGame}
            ref={iframeRef}
            src={currentGame.iframe}
            className="w-full h-[80vh] md:h-[85vh] border-none"
            sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
            allow="fullscreen"
          />
        ) : !authenticated ? (
          <LandingPage onConnectWallet={handleConnectWallet} />
        ) : (
<PlayerGameSelection
games={GAMES}
onGameSelect={handleGameSelect}
onBackToRoles={handleBackToMenu}
accountAddress={accountAddress}
onDisconnect={handleDisconnect}
onRetrySetup={handleConnectWallet}
setupError={setupError}
currentNetwork={currentNetwork}
/>
        )}
               {/* <FundingButton
                accountAddress={accountAddress}
                /> */}
              

      </main>
               

      {/* Footer */}
      <footer className="border-t border-[#1a1a1a] bg-none backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:py-2 mt-1 py-4">
          <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start justify-center sm:justify-start text-sm text-gray-400 mb-0 sm:mb-0">
              <div className="flex items-center justify-center mb-1">
                <p className="text-gray-400 text-sm mr-3">Network:</p>
                <div className="flex rounded-md bg-[#0f0f0f] p-0.5 flex-wrap gap-1">
                  {Object.keys(NETWORKS).map((networkKey) => (
                    <div
                      key={networkKey}
                      className={`px-3 py-1.5 rounded-md text-xs transition-all duration-200 ${
                        currentNetwork === networkKey
                          ? "bg-[#2a2a2a] text-white shadow-sm"
                          : "text-gray-400 hover:text-gray-200"
                      } cursor-pointer ${isSettingUp ? "opacity-50 pointer-events-none" : ""}`}
                      onClick={() => {
                        if (!isSettingUp) {
                          handleNetworkChange(networkKey as NetworkKey)
                        }
                      }}
                    >
                      {getNetworkDisplayName(networkKey as NetworkKey)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col md:mt-0 mt-2 text-center items-center md:items-end text-xs text-gray-500 leading-tight text-right">
              <span>Playerhouse supports USDC on Arbitrum</span>
              <span>Powered by Chainlink</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AnimatePresence>
        {showModal && modalType === "account" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
<AccountDetailsModal
  accountAddress={accountAddress}
  onClose={() => setShowModal(false)}
  onCopyAddress={copyAddress}
  copied={copied}
  approval={approval}
  sessionKey={sessionKey}
  currentNetwork={currentNetwork} // Add this line
/>
            </motion.div>
          </motion.div>
        )}

        {showModal && modalType === "networkSwitch" && pendingNetworkSwitch && (
          <NetworkSwitchModal
            isOpen={true}
            onClose={() => {
              setShowModal(false)
              setPendingNetworkSwitch(null)
            }}
            onSwitchNetwork={handleNetworkSwitchConfirm}
            targetNetwork={pendingNetworkSwitch}
            currentWalletType={currentWalletType}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
