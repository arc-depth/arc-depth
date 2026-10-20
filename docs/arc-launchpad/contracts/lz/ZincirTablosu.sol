// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";

/// @title ZincirTablosu — the nine EVM chains ARC PULSE runs on, in code
/// @notice Why the table lives in the bytecode instead of in constructor
///         arguments: LayerZero's endpoint sits at three different addresses
///         across these chains, and a factory that takes it as an argument
///         lands at a different address on each chain. With the table inside,
///         one bytecode deploys to ONE address on all nine, so a token's twin
///         address is known on every chain before the twin exists.
///
///         Why it also writes DVN config: measured on 14 Oct 2026, the
///         LayerZero default on the Arc <-> Robinhood pathway is LZDeadDVN. An
///         OApp whose owner is burned at birth and left on defaults would never
///         receive a message there. `dvnYaz` is called by the OApp on itself
///         while it is still its own delegate, and sets two required DVNs —
///         LayerZero Labs and Nethermind — on every pathway, both directions.
///
///         Sources (read and checked on chain 14 Oct 2026): LayerZero metadata
///         API for eids, endpoints and ULN302 libraries; for each chain the
///         LayerZero Labs and Nethermind DVN that quote ALL eleven other
///         destinations (each chain also lists a second LZ Labs / Nethermind
///         address that does not — that one is not here).
library ZincirTablosu {
    struct Zincir {
        uint256 chainId;
        uint32 eid;
        address endpoint;
        address gonderim;   // SendUln302
        address alim;       // ReceiveUln302
        address dvn0;       // the two required DVNs, ascending
        address dvn1;
        uint64 onay;        // block confirmations for messages that START here
    }

    uint256 internal constant ADET = 9;
    uint32 internal constant ULN_TIPI = 2;

    error BilinmeyenZincir(uint256 chainId);

    function _z(uint256 i) private pure returns (Zincir memory) {
        if (i == 0) return Zincir(5042, 30417, 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B,
            0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7, 0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043,
            0x9E0E95Ede70F680f74480b510FF9f45C70e3da80, 0xa2447e5B58D357c49Bf74B50B14421e6A100e525, 5);
        if (i == 1) return Zincir(4663, 30416, 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B,
            0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7, 0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043,
            0x0Ffe02DF012299A370D5dd69298A5826EAcaFdF8, 0xd01ae6905d48315f7bE10C7330aeCF8360Ef5b12, 20);
        if (i == 2) return Zincir(8453, 30184, 0x1a44076050125825900e736c501f859c50fE728c,
            0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2, 0xc70AB6f32772f59fBfc23889Caf4Ba3376C84bAf,
            0x9e059a54699a285714207b43B055483E78FAac25, 0xcd37CA043f8479064e10635020c65FfC005d36f6, 10);
        if (i == 3) return Zincir(42161, 30110, 0x1a44076050125825900e736c501f859c50fE728c,
            0x975bcD720be66659e3EB3C0e4F1866a3020E493A, 0x7B9E184e07a6EE1aC23eAe0fe8D6Be2f663f05e6,
            0x2f55C492897526677C5B68fb199ea31E2c126416, 0xa7b5189bcA84Cd304D8553977c7C614329750d99, 20);
        if (i == 4) return Zincir(1, 30101, 0x1a44076050125825900e736c501f859c50fE728c,
            0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1, 0xc02Ab410f0734EFa3F14628780e6e695156024C2,
            0x589dEDbD617e0CBcB916A9223F4d1300c294236b, 0xa59BA433ac34D2927232918Ef5B2eaAfcF130BA5, 15);
        if (i == 5) return Zincir(56, 30102, 0x1a44076050125825900e736c501f859c50fE728c,
            0x9F8C645f2D0b2159767Bd6E0839DE4BE49e823DE, 0xB217266c3A98C8B2709Ee26836C98cf12f6cCEC1,
            0x31F748a368a893Bdb5aBB67ec95F232507601A73, 0xfD6865c841c2d64565562fCc7e05e619A30615f0, 20);
        if (i == 6) return Zincir(43114, 30106, 0x1a44076050125825900e736c501f859c50fE728c,
            0x197D1333DEA5Fe0D6600E9b396c7f1B1cFCc558a, 0xbf3521d309642FA9B1c91A08609505BA09752c61,
            0x962F502A63F5FBeB44DC9ab932122648E8352959, 0xa59BA433ac34D2927232918Ef5B2eaAfcF130BA5, 12);
        if (i == 7) return Zincir(143, 30390, 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B,
            0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7, 0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043,
            0x282b3386571f7f794450d5789911a9804FA346b4, 0xaCDe1f22EEAb249d3ca6Ba8805C8fEe9f52a16e7, 10);
        if (i == 8) return Zincir(999, 30367, 0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9,
            0xfd76d9CB0Bac839725aB79127E7411fe71b1e3CA, 0x7cacBe439EaD55fa1c22790330b12835c6884a91,
            0x8E49eF1DfAe17e547CA0E7526FfDA81FbaCA810A, 0xc097ab8CD7b053326DFe9fB3E3a31a0CCe3B526f, 10);
        revert BilinmeyenZincir(i);
    }

    function sira(uint256 i) internal pure returns (Zincir memory) { return _z(i); }

    function burasi() internal view returns (Zincir memory z) {
        for (uint256 i; i < ADET; i++) {
            z = _z(i);
            if (z.chainId == block.chainid) return z;
        }
        revert BilinmeyenZincir(block.chainid);
    }

    function eidIle(uint32 eid) internal pure returns (Zincir memory z) {
        for (uint256 i; i < ADET; i++) {
            z = _z(i);
            if (z.eid == eid) return z;
        }
        revert BilinmeyenZincir(eid);
    }

    function _uln(uint64 onay, address d0, address d1) private pure returns (bytes memory) {
        address[] memory zorunlu = new address[](2);
        zorunlu[0] = d0;
        zorunlu[1] = d1;
        /* UlnConfig: confirmations, requiredDVNCount, optionalDVNCount,
           optionalDVNThreshold, requiredDVNs, optionalDVNs */
        return abi.encode(UlnConfig(onay, 2, 0, 0, zorunlu, new address[](0)));
    }

    struct UlnConfig {
        uint64 confirmations;
        uint8 requiredDVNCount;
        uint8 optionalDVNCount;
        uint8 optionalDVNThreshold;
        address[] requiredDVNs;
        address[] optionalDVNs;
    }

    /// Writes the two-DVN config for every pathway between this chain and
    /// the eight others, both directions. Must be called by the OApp itself
    /// (or its delegate) before the delegate is burned.
    ///   sending from here:   confirmations = this chain's number
    ///   receiving from X:    confirmations = X's number, as X's DVNs wait for
    /// The same two required DVNs of this chain on a path to a chain outside
    /// the table (Solana, Sui, Aptos): sending with this chain's confirmations,
    /// receiving with `alimOnay` (the remote chain's). The OApp's delegate calls this.
    function uzakDvnYaz(address oapp, uint32 eid, uint64 alimOnay) internal {
        Zincir memory b = burasi();
        SetConfigParam[] memory gid = new SetConfigParam[](1);
        SetConfigParam[] memory gel = new SetConfigParam[](1);
        gid[0] = SetConfigParam(eid, ULN_TIPI, _uln(b.onay, b.dvn0, b.dvn1));
        gel[0] = SetConfigParam(eid, ULN_TIPI, _uln(alimOnay, b.dvn0, b.dvn1));
        ILayerZeroEndpointV2(b.endpoint).setConfig(oapp, b.gonderim, gid);
        ILayerZeroEndpointV2(b.endpoint).setConfig(oapp, b.alim, gel);
    }

    function dvnYaz(address oapp) internal {
        Zincir memory b = burasi();
        SetConfigParam[] memory gid = new SetConfigParam[](ADET - 1);
        SetConfigParam[] memory gel = new SetConfigParam[](ADET - 1);
        uint256 j;
        for (uint256 i; i < ADET; i++) {
            Zincir memory k = _z(i);
            if (k.eid == b.eid) continue;
            gid[j] = SetConfigParam(k.eid, ULN_TIPI, _uln(b.onay, b.dvn0, b.dvn1));
            gel[j] = SetConfigParam(k.eid, ULN_TIPI, _uln(k.onay, b.dvn0, b.dvn1));
            j++;
        }
        ILayerZeroEndpointV2(b.endpoint).setConfig(oapp, b.gonderim, gid);
        ILayerZeroEndpointV2(b.endpoint).setConfig(oapp, b.alim, gel);
    }
}
