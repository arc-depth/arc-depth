// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20C {
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function allowance(address o, address s) external view returns (uint256);
}

interface ITokenMessengerGercek {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external;

    function localMinter() external view returns (address);
    function remoteTokenMessengers(uint32) external view returns (bytes32);
    function isDenylisted(address) external view returns (bool);
}

/// @notice Does Arc's REAL CCTP contract accept the call this project
///         intends to make?
///
/// WHY THIS CANNOT BE DONE ON AN ANVIL FORK
///   Arc is not a vanilla EVM chain. Its USDC asks a custom precompile at
///   0x1800…0001 whether an address is blocklisted, and anvil has no such
///   precompile — every transferFrom dies with OpcodeNotFound. Injecting a
///   stub there works for eth_call and does NOT work for the transaction
///   path, so a forked Arc cannot burn USDC at all.
///
///   The real node implements the precompile. So the Arc side is measured
///   the way everything else in this project is measured: one eth_call
///   against mainnet with the harness injected by state override, which
///   runs the real TokenMessenger, the real USDC and the real precompile
///   inside a single simulated transaction.
///
/// WHAT A PASS MEANS AND WHAT IT DOES NOT
///   It means the outbound leg is real: the signature is right, the
///   parameters are acceptable, the allowance and the burn work, and the
///   balance falls by exactly the amount sent. It does NOT mean the money
///   arrives — the mint on the destination needs Circle's attestation,
///   which is off-chain and cannot be produced for a simulated burn. That
///   half is the remote fork's job.
contract TestGercekCCTP {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant TOKEN_MESSENGER = 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d;

    struct Sonuc {
        uint256 bakiyeOnce;
        uint256 bakiyeSonra;
        uint256 harcanan;
        uint256 allowanceSonra;
        address localMinter;
        bytes32 uzakMessenger;
        bool denylistte;
        bool kancaliGecti;
        bytes kancaliSebep;
        bool sadeGecti;
        bytes sadeSebep;
    }

    /// @param domain       CCTP destination domain (0 = Ethereum)
    /// @param alici        mintRecipient, as CCTP wants it
    /// @param miktar       USDC units
    /// @param azamiUcret   the most we will pay the bridge
    /// @param kesinlik     1000 fast, 2000 finalized
    function run(
        uint32 domain,
        bytes32 alici,
        uint256 miktar,
        uint256 azamiUcret,
        uint32 kesinlik
    ) external returns (Sonuc memory s) {
        ITokenMessengerGercek tm = ITokenMessengerGercek(TOKEN_MESSENGER);

        /* Read the configuration first, so a failure can be told apart from
           a misconfiguration. */
        s.localMinter = tm.localMinter();
        s.uzakMessenger = tm.remoteTokenMessengers(domain);
        s.denylistte = tm.isDenylisted(address(this));

        s.bakiyeOnce = IERC20C(USDC).balanceOf(address(this));

        /* Approve exactly twice the amount: enough for both attempts below
           without an unlimited allowance sitting on a contract that holds
           real money. */
        IERC20C(USDC).approve(TOKEN_MESSENGER, miktar * 2);

        /* The hook variant is the one this project uses: it carries the
           tokenId and the transfer id to the remote vault atomically with
           the mint, so the remote side never has to be told separately. */
        bytes memory kanca = abi.encode(uint8(0), uint256(7), address(0), miktar, bytes32(uint256(1)));
        try tm.depositForBurnWithHook(
            miktar, domain, alici, USDC, bytes32(0), azamiUcret, kesinlik, kanca
        ) {
            s.kancaliGecti = true;
        } catch (bytes memory e) {
            s.kancaliGecti = false;
            s.kancaliSebep = e;
        }

        /* And the plain variant, so a failure can be attributed to the hook
           rather than to CCTP as a whole. */
        try tm.depositForBurn(
            miktar, domain, alici, USDC, bytes32(0), azamiUcret, kesinlik
        ) {
            s.sadeGecti = true;
        } catch (bytes memory e) {
            s.sadeGecti = false;
            s.sadeSebep = e;
        }

        s.bakiyeSonra = IERC20C(USDC).balanceOf(address(this));
        s.harcanan = s.bakiyeOnce > s.bakiyeSonra ? s.bakiyeOnce - s.bakiyeSonra : 0;
        s.allowanceSonra = IERC20C(USDC).allowance(address(this), TOKEN_MESSENGER);
    }
}
